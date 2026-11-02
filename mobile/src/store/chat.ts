// The Session screen's data, one store per session, keyed by stored id (or a
// local id for a session not created on the gateway yet).
//
// A trimmed port of the desktop's session state and message stream
// (apps/desktop/src/store/session*.ts and
// apps/desktop/src/app/session/hooks/use-message-stream/). The parts:
// - opening: saved transcript first, then the gateway's newest rows, then
//   `session.resume` to attach to the Live session
// - streaming: events are routed by runtime id; text deltas are applied at
//   most once per frame (the desktop's `flushQueuedDeltas`)
// - sending: every message goes through the outbox, so none is lost
// - catching up: after a reconnect every attached session is resumed again,
//   and reloaded when the shared client couldn't replay what was missed
// - watching: a session the phone hasn't opened can be attached without its
//   transcript, so its waiting request raises the usual notification, and
//   detached again afterwards (see background/watch.ts)

import { JsonRpcGatewayError } from '@hermes/shared/json-rpc-channel'
import type { GatewayEvent } from '@hermes/shared/json-rpc-gateway'
import { atom, type WritableAtom } from 'nanostores'

import { type Attachment, attachmentExists, readAttachment } from '@/chat/attachments'
import { type ChatItem, gatewayText, itemsFromRows, lastTurnMessage, newKey, type UserItem } from '@/chat/items'
import { appendReasoning, appendReply, applyEvent, type SessionModel, sessionModel, type StreamState, withInflight } from '@/chat/stream'
import { keepStats, mergeTotals, sessionTotals } from '@/chat/turn-stats'
import {
  type CreateAnswer,
  loadTranscriptPage,
  PROMPT_SUBMIT_TIMEOUT_MS,
  type ResumeAnswer,
  type SubmitAnswer
} from '@/gateway/chat-api'
import { isUnreachableError } from '@/gateway/rest'
import {
  addToOutbox,
  loadOutbox,
  markInterruptedSends,
  moveOutboxSession,
  type OutboxEntry,
  removeFromOutbox,
  setOutboxState
} from '@/storage/outbox'
import { loadTranscript, markOpened, saveTranscript } from '@/storage/transcripts'

import { $gateway, type GatewayContext, onGatewayChange } from './gateway'
import { $sessionRows, clearLocalMarker, setLocalMarker } from './sessions'

export interface ChatSession extends StreamState {
  /** The stored id, or `local-…` for a session not created on the gateway yet. */
  key: string
  /** Set once the gateway has the session. */
  storedId: string | null
  /** The Live session's id. Changes when the gateway reloads the session. */
  runtimeId: string | null
  /**
   * - `loading`: nothing to show yet
   * - `saved`: showing the copy saved on the phone
   * - `loaded`: showing what the gateway sent
   * - `not-saved`: offline, and this phone has no copy
   */
  transcript: 'loading' | 'saved' | 'loaded' | 'not-saved'
  hasEarlier: boolean
  loadingEarlier: boolean
  /** How many gateway rows are loaded, for paging older rows. */
  gatewayRows: number
  /** The model chosen for a session not created on the gateway yet. It's created with this model. */
  pickedModel?: SessionModel | null
}

/** A message waits in the outbox for this long before it asks to be sent. */
export const OUTBOX_MAX_AGE_S = 24 * 60 * 60

const stores = new Map<string, WritableAtom<ChatSession>>()
/** Runtime id to chat key, for routing events. */
const byRuntimeId = new Map<string, string>()
/** Sessions this phone attached to, which are attached again after a reconnect. */
const attached = new Set<string>()
/** Sessions whose missed events couldn't be replayed. They reload on the next attach. */
const gaps = new Set<string>()
/** Old outbox entries the person chose to send anyway. */
const confirmedOld = new Set<string>()
/** Sessions attached only to alert the person, not opened on the phone. Their transcript isn't loaded. */
const watched = new Set<string>()
/** Each attached session's subscription, when the gateway gives one. */
const subscriptions = new Map<string, string>()

/**
 * Whether this gateway gives each connection its own subscription, which it
 * can drop with `session.detach`. Null until a `session.resume` answer says.
 */
export const $canDetach = atom<boolean | null>(null)

const blank = (key: string): ChatSession => ({
  key,
  storedId: key.startsWith('local-') ? null : key,
  runtimeId: null,
  items: [],
  running: false,
  status: null,
  title: null,
  transcript: key.startsWith('local-') ? 'loaded' : 'loading',
  hasEarlier: false,
  loadingEarlier: false,
  gatewayRows: 0
})

/** The store for one session. Made on first use. */
export function chatStore(key: string): WritableAtom<ChatSession> {
  let store = stores.get(key)

  if (!store) {
    store = atom(blank(key))
    stores.set(key, store)
  }

  return store
}

const update = (key: string, change: (state: ChatSession) => ChatSession) => {
  const store = chatStore(key)
  store.set(change(store.get()))
}

const gatewayOrThrow = (): GatewayContext => {
  const gateway = $gateway.get()

  if (!gateway) {
    throw new Error('Not signed in.')
  }

  return gateway
}

/** A key for a new session, before it exists on the gateway. */
export const newLocalKey = () => newKey('local')

// ------------------------------------------------------------ hooks for other stores

type SessionEventListener = (key: string, event: GatewayEvent) => void
const eventListeners = new Set<SessionEventListener>()

/** Every event routed to a session open on the phone. The approvals store watches these. */
export function onSessionEvent(listener: SessionEventListener): () => void {
  eventListeners.add(listener)

  return () => eventListeners.delete(listener)
}

type OpenRequestsListener = (key: string, open: NonNullable<ResumeAnswer['open_requests']>) => void
const openRequestListeners = new Set<OpenRequestsListener>()

/**
 * The server requests still open after a resume. The shared channel has
 * already handed each one to the request handlers; this lets a store drop
 * cards that are no longer in the list.
 */
export function onOpenRequests(listener: OpenRequestsListener): () => void {
  openRequestListeners.add(listener)

  return () => openRequestListeners.delete(listener)
}

/** The chat key for a runtime id, if the session is open on the phone. */
export const keyForRuntimeId = (runtimeId: string | undefined) => (runtimeId ? byRuntimeId.get(runtimeId) : undefined)

let resuming = 0

/**
 * A `session.resume` is waiting for its answer. The shared channel hands the
 * answer's `open_requests` to the request handlers before the answer reaches
 * `attach`, so their runtime id isn't known yet. The approvals store holds
 * such requests until `attach` has linked the runtime id.
 */
export const isResuming = () => resuming > 0

/** Adds a note to a session's transcript, such as the timed-out note. */
export function addNote(key: string, text: string, tone: 'error' | 'info' = 'info', command?: string) {
  update(key, state => ({ ...state, items: [...state.items, { kind: 'note', key: newKey('note'), text, tone, ...(command ? { command } : {}) }] }))
  void persist(key)
}

// ------------------------------------------------------------ saving

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

async function persist(key: string) {
  const gateway = $gateway.get()
  const state = chatStore(key).get()

  if (!gateway || !state.storedId || state.transcript === 'loading' || state.transcript === 'not-saved') {
    return
  }

  await saveTranscript(gateway.db, state.storedId, {
    items: state.items,
    hasEarlier: state.hasEarlier,
    gatewayRows: state.gatewayRows
  }).catch((error: unknown) => console.warn('Could not save the transcript', error))
}

function persistSoon(key: string) {
  clearTimeout(saveTimers.get(key))
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key)
      void persist(key)
    }, 500)
  )
}

// ------------------------------------------------------------ streaming

interface PendingDeltas {
  reply: string
  reasoning: string
}

const pending = new Map<string, PendingDeltas>()
let frameScheduled = false

const nextFrame: (task: () => void) => void =
  typeof requestAnimationFrame === 'function' ? task => requestAnimationFrame(() => task()) : task => setTimeout(task, 16)

/** Applies every queued delta. Runs at most once per frame. */
export function flushDeltas(key?: string) {
  for (const [queuedKey, deltas] of [...pending]) {
    if (key && queuedKey !== key) {
      continue
    }

    pending.delete(queuedKey)
    update(queuedKey, state => appendReply(appendReasoning(state, deltas.reasoning), deltas.reply) as ChatSession)
  }
}

function queueDelta(key: string, kind: keyof PendingDeltas, text: string) {
  const deltas = pending.get(key) ?? { reply: '', reasoning: '' }
  deltas[kind] += text
  pending.set(key, deltas)

  if (!frameScheduled) {
    frameScheduled = true
    nextFrame(() => {
      frameScheduled = false
      flushDeltas()
    })
  }
}

function handleEvent(event: GatewayEvent) {
  const key = keyForRuntimeId(event.session_id)

  if (!key) {
    return
  }

  const payload = event.payload as Record<string, unknown> | undefined

  switch (event.type) {
    case 'message.delta':
      // `text: null` marks a break between reply blocks.
      if (payload?.text === null) {
        flushDeltas(key)
        update(key, state => applyEvent(state, 'message.interim', { text: '' }) as ChatSession)
      } else if (typeof payload?.text === 'string') {
        queueDelta(key, 'reply', payload.text)
      }

      break

    case 'reasoning.delta':
      if (typeof payload?.text === 'string') {
        queueDelta(key, 'reasoning', payload.text)
      }

      break

    case 'session.replay_gap':
      gaps.add(key)
      void attach(key)

      break

    default:
      flushDeltas(key)
      update(key, state => applyEvent(state, event.type, payload) as ChatSession)
  }

  const state = chatStore(key).get()

  if (event.type === 'message.start' && state.storedId) {
    setLocalMarker(state.storedId, 'running')
  }

  if (event.type === 'message.complete') {
    if (state.storedId) {
      setLocalMarker(state.storedId, null)
    }

    persistSoon(key)
  }

  for (const listener of eventListeners) {
    listener(key, event)
  }
}

// ------------------------------------------------------------ opening

const titleFromList = (storedId: string) => $sessionRows.get().find(row => row.id === storedId)?.title ?? null

function withOutboxItems(items: ChatItem[], entries: OutboxEntry[]): ChatItem[] {
  const shown = new Set(items.map(item => (item.kind === 'user' ? item.outboxId : undefined)).filter(Boolean))
  const now = Date.now() / 1000
  const added: UserItem[] = entries
    .filter(entry => !shown.has(entry.id))
    .map(entry => ({
      kind: 'user',
      key: `outbox-${entry.id}`,
      text: entry.text,
      outboxId: entry.id,
      state: now - entry.createdAt > OUTBOX_MAX_AGE_S && !confirmedOld.has(entry.id) ? 'old' : 'waiting',
      ...(entry.attachments ? { attachments: entry.attachments } : {})
    }))

  return added.length ? [...items, ...added] : items
}

/** The gateway's newest rows replace what's shown. Messages still in the outbox stay at the end. */
async function loadLatest(key: string, gateway: GatewayContext) {
  const storedId = chatStore(key).get().storedId

  if (!storedId) {
    return
  }

  const page = await loadTranscriptPage(gateway.rest, storedId)
  const outbox = (await loadOutbox(gateway.db)).filter(entry => entry.sessionKey === key)

  update(key, state => ({
    ...state,
    items: withOutboxItems(keepStats(state.items, itemsFromRows(page.rows)), outbox),
    hasEarlier: page.hasEarlier,
    gatewayRows: page.rows.length,
    transcript: 'loaded'
  }))
  await persist(key)
}

/**
 * Opens a session: the saved transcript at once, then the gateway's newest
 * rows, then attaches to the Live session. Works offline from saved data.
 */
export async function openChat(key: string): Promise<void> {
  const gateway = gatewayOrThrow()
  const store = chatStore(key)
  const { storedId } = store.get()

  if (!storedId) {
    // A new session. It's created on the gateway with its first message.
    return
  }

  // A watched session that the person opens is an ordinary open session from now on.
  watched.delete(key)

  if (!store.get().title) {
    update(key, state => ({ ...state, title: titleFromList(storedId) }))
  }

  await markOpened(gateway.db, storedId)

  if (store.get().transcript === 'loading') {
    const saved = await loadTranscript(gateway.db, storedId)
    const outbox = (await loadOutbox(gateway.db)).filter(entry => entry.sessionKey === key)

    if (saved) {
      update(key, state => ({
        ...state,
        items: withOutboxItems(saved.items, outbox),
        hasEarlier: saved.hasEarlier,
        gatewayRows: saved.gatewayRows,
        transcript: 'saved'
      }))
    } else if (outbox.length) {
      update(key, state => ({ ...state, items: withOutboxItems(state.items, outbox) }))
    }
  }

  attached.add(key)

  if (gateway.connection.$status.get() === 'offline') {
    markNotSaved(key)

    return
  }

  // Already showing a turn that streams into memory: the rows would only cut it off.
  const live = store.get().running && store.get().transcript === 'loaded'

  try {
    if (!live) {
      await loadLatest(key, gateway)
    }
  } catch (error) {
    if (!isUnreachableError(error)) {
      console.warn('Could not load the transcript', error)
    }

    markNotSaved(key)
  }

  if (gateway.connection.isOpen) {
    await attach(key)
  }
}

function markNotSaved(key: string) {
  update(key, state => (state.transcript === 'loading' ? { ...state, transcript: 'not-saved' } : state))
}

/** The screen was closed. The session stays attached, so its turn keeps updating the phone. */
export function closeChat(key: string) {
  flushDeltas(key)
  void persist(key)
}

/**
 * Attaches to the Live session with `session.resume`, or attaches again after
 * a reconnect. When missed events couldn't be replayed, the newest rows are
 * loaded again first.
 */
export async function attach(key: string): Promise<void> {
  const gateway = $gateway.get()
  const before = chatStore(key).get()

  if (!gateway?.connection.isOpen || !before.storedId) {
    return
  }

  const { client } = gateway.connection

  // Let the shared client finish replaying what this session missed.
  if (before.runtimeId) {
    await client.sessionReplayBarrier(before.runtimeId)
  }

  let answer: ResumeAnswer

  resuming++

  try {
    answer = await client.request<ResumeAnswer>('session.resume', { session_id: before.storedId, omit_messages: true })
  } finally {
    resuming--
  }

  const runtimeId = answer.session_id
  const moved = before.runtimeId !== null && before.runtimeId !== runtimeId
  // A watched session has no transcript to keep current.
  const reload = !watched.has(key) && (gaps.has(key) || moved || chatStore(key).get().transcript !== 'loaded')

  if (before.runtimeId && before.runtimeId !== runtimeId) {
    byRuntimeId.delete(before.runtimeId)
  }

  byRuntimeId.set(runtimeId, key)
  attached.add(key)
  gaps.delete(key)
  $canDetach.set(Boolean(answer.subscription_id))

  if (answer.subscription_id) {
    subscriptions.set(key, answer.subscription_id)
  } else {
    subscriptions.delete(key)
  }

  if (reload) {
    await loadLatest(key, gateway).catch(() => undefined)
  }

  update(key, state => {
    let next: ChatSession = {
      ...state,
      runtimeId,
      title: answer.info?.title || state.title,
      model: sessionModel(answer.info) ?? state.model,
      totals: mergeTotals(state.totals, sessionTotals(answer.info?.usage))
    }

    if (answer.running) {
      // Rebuild the reply in progress, unless the replayed events already show it.
      const streaming = next.items.at(-1)?.kind === 'assistant' && next.running

      next = reload || !streaming ? (withInflight(next, answer.inflight) as ChatSession) : { ...next, running: true }

      // Events were missed, so the phone may not have seen this turn start.
      if (reload) {
        next = { ...next, turn: null }
      }
    } else if (next.running) {
      // The turn ended while the phone wasn't attached, so the phone can't say how long it took.
      next = applyEvent({ ...next, turn: null }, 'message.complete', {}) as ChatSession
    }

    return next
  })

  setLocalMarker(before.storedId, answer.running ? 'running' : null)

  for (const listener of openRequestListeners) {
    listener(key, answer.open_requests ?? [])
  }
}

/**
 * Attaches to a session the phone hasn't opened, so its waiting requests
 * arrive as cards and raise the usual notifications. The transcript isn't
 * loaded. Does nothing for a session that's already attached.
 */
export async function watchChat(key: string): Promise<void> {
  if (attached.has(key) || !$gateway.get()?.connection.isOpen) {
    return
  }

  watched.add(key)

  try {
    await attach(key)
  } catch (error) {
    watched.delete(key)
    throw error
  }
}

/** The session is attached only to alert the person. */
export const isWatched = (key: string) => watched.has(key)

/**
 * Drops a watched session's subscription with `session.detach`, so the
 * gateway can unload the session once nobody uses it. Never `session.close`,
 * which would unload it for every device. Does nothing when the gateway gave
 * no subscription: then the session stays attached until the connection
 * closes, like a session opened on the phone.
 */
export async function detachChat(key: string): Promise<void> {
  const subscription = subscriptions.get(key)
  const { runtimeId, storedId } = chatStore(key).get()

  if (!watched.has(key) || !subscription || !runtimeId) {
    return
  }

  watched.delete(key)
  attached.delete(key)
  subscriptions.delete(key)
  byRuntimeId.delete(runtimeId)
  update(key, state => ({ ...state, runtimeId: null, running: false }))

  if (storedId) {
    clearLocalMarker(storedId)
  }

  const connection = $gateway.get()?.connection

  if (connection?.isOpen) {
    await connection.client
      .request('session.detach', { session_id: runtimeId, subscription_id: subscription })
      .catch((error: unknown) => console.warn('Could not detach from the session', error))
  }
}

/** Loads the page of rows before the ones shown ("Show earlier"). */
export async function loadEarlier(key: string) {
  const gateway = gatewayOrThrow()
  const state = chatStore(key).get()

  if (!state.storedId || !state.hasEarlier || state.loadingEarlier) {
    return
  }

  update(key, current => ({ ...current, loadingEarlier: true }))

  try {
    const page = await loadTranscriptPage(gateway.rest, state.storedId, state.gatewayRows)

    update(key, current => ({
      ...current,
      items: [...itemsFromRows(page.rows), ...current.items],
      hasEarlier: page.hasEarlier,
      gatewayRows: current.gatewayRows + page.rows.length
    }))
    await persist(key)
  } finally {
    update(key, current => ({ ...current, loadingEarlier: false }))
  }
}

// ------------------------------------------------------------ sending

/**
 * Sends a message. It's saved in the outbox first and shown at once; the
 * outbox sends it now if the gateway can be reached, or when it can.
 */
/** `shown` is what the message shows instead of `text`, such as the skill command that `text` came from. */
export function sendMessage(key: string, text: string, attachments: Attachment[] = [], shown?: string) {
  return queueMessage(key, text, false, attachments, shown)
}

/**
 * Retry: sends the message the last turn answered again. When it's sent, the
 * gateway drops that turn first, if its message is still the session's last
 * (see `retryCut`). Otherwise it goes as a new message and the old turn stays.
 */
export async function retryTurn(key: string) {
  const { items } = chatStore(key).get()
  const text = lastTurnMessage(items)

  if (text !== null) {
    // The photos and files go again too, while the phone still has its copies.
    const asked = items.findLast((item): item is UserItem => item.kind === 'user')

    await queueMessage(key, text, true, (asked?.attachments ?? []).filter(attachmentExists))
  }
}

async function queueMessage(key: string, text: string, retry: boolean, attachments: Attachment[] = [], shown?: string) {
  const gateway = gatewayOrThrow()
  const entry: OutboxEntry = {
    id: newKey('out'),
    sessionKey: key,
    text,
    createdAt: Date.now() / 1000,
    state: 'waiting',
    ...(retry ? { retry: true } : {}),
    ...(attachments.length ? { attachments } : {})
  }

  await addToOutbox(gateway.db, entry)
  update(key, state => ({
    ...state,
    items: [
      ...state.items,
      {
        kind: 'user',
        key: `outbox-${entry.id}`,
        text: shown ?? text,
        ...(shown !== undefined && shown !== text ? { sentText: text } : {}),
        outboxId: entry.id,
        state: 'waiting',
        ...(attachments.length ? { attachments } : {}),
        ...(state.running ? { duringTurn: true } : {})
      }
    ]
  }))

  void processOutbox()
}

/** Stops the running turn. */
export async function stopTurn(key: string) {
  const gateway = gatewayOrThrow()
  const { runtimeId } = chatStore(key).get()

  if (runtimeId && gateway.connection.isOpen) {
    await gateway.connection.client.request('session.interrupt', { session_id: runtimeId })
  }
}

/** Removes a message from the outbox before it's sent ("Cancel" and "Discard"). */
export async function cancelOutboxMessage(key: string, outboxId: string) {
  const gateway = gatewayOrThrow()

  await removeFromOutbox(gateway.db, outboxId)
  update(key, state => ({ ...state, items: state.items.filter(item => !(item.kind === 'user' && item.outboxId === outboxId)) }))
}

/** "Send now" for a message that waited more than 24 hours. */
export function confirmOldOutboxMessage(key: string, outboxId: string) {
  confirmedOld.add(outboxId)
  setOutboxItem(key, outboxId, item => ({ ...item, state: 'waiting' }))
  void processOutbox()
}

/** What the desktop sends for a photo with no words. */
const IMAGE_ONLY_TEXT = 'What do you see in this image?'
/** A phone photo is a few MB of base64: give the upload longer than an ordinary request. */
const ATTACH_TIMEOUT_MS = 120_000

/**
 * Uploads a message's photos and files to the Live session, as the desktop
 * does for a remote gateway: a photo with `image.attach_bytes`, which the
 * gateway holds for the next turn, and any other file with `file.attach`,
 * whose reference line goes before the message. Returns the text to send.
 */
async function uploadAttachments(gateway: GatewayContext, runtimeId: string, entry: OutboxEntry): Promise<string> {
  const attachments = entry.attachments ?? []
  const refs: string[] = []

  for (const attachment of attachments) {
    const base64 = await readAttachment(attachment)

    if (attachment.kind === 'image') {
      const answer = await gateway.connection.client.request<{ attached?: boolean; message?: string }>(
        'image.attach_bytes',
        { session_id: runtimeId, content_base64: base64, filename: attachment.name },
        ATTACH_TIMEOUT_MS
      )

      if (!answer?.attached) {
        throw new Error(answer?.message || `Could not attach ${attachment.name}`)
      }
    } else {
      const answer = await gateway.connection.client.request<{ attached?: boolean; ref_text?: string; message?: string }>(
        'file.attach',
        { session_id: runtimeId, name: attachment.name, data_url: `data:${attachment.mime ?? 'application/octet-stream'};base64,${base64}` },
        ATTACH_TIMEOUT_MS
      )

      if (!answer?.attached || !answer.ref_text) {
        throw new Error(answer?.message || `Could not attach ${attachment.name}`)
      }

      refs.push(answer.ref_text)
    }
  }

  const text = [refs.join('\n'), entry.text].filter(Boolean).join('\n\n')

  return text || (attachments.some(attachment => attachment.kind === 'image') ? IMAGE_ONLY_TEXT : '')
}

/** The gateway saved this message: the same text, or with file references before it. */
function savedAs(saved: string, text: string): boolean {
  const kept = saved.trim()
  const sent = text.trim()

  return sent ? kept === sent || kept.endsWith(`\n\n${sent}`) : kept === IMAGE_ONLY_TEXT
}

/**
 * The `prompt.submit` fields that drop the turn a Retry repeats. Its
 * message must be the session's last saved user message, with the
 * same text. Anything else gives null, and the Retry goes without a cut: a
 * cut placed by guess could delete turns.
 */
async function retryCut(gateway: GatewayContext, runtimeId: string, text: string): Promise<Record<string, unknown> | null> {
  let messages: unknown[]

  try {
    const answer = await gateway.connection.client.request<{ messages?: unknown }>('session.history', { session_id: runtimeId })
    messages = Array.isArray(answer?.messages) ? answer.messages : []
  } catch {
    return null
  }

  const users = (messages as { role?: unknown; display_kind?: unknown; row_id?: unknown; text?: unknown; content?: unknown }[]).filter(
    message => message.role === 'user' && !message.display_kind && Number.isInteger(message.row_id)
  )
  const last = users.at(-1)

  if (!last || !savedAs(gatewayText(last.text ?? last.content), text)) {
    return null
  }

  return {
    confirm_truncate: true,
    truncate_before_row_id: last.row_id,
    // The message was the session's first: the cut leaves it empty.
    ...(users.length === 1 ? { confirm_empty_truncate: true } : {})
  }
}

/** After a Retry's cut: the old turn goes from the screen too. It's everything from its message up to the Retry. */
function dropRetriedTurn(key: string, outboxId: string) {
  update(key, state => {
    const retry = state.items.findIndex(item => item.kind === 'user' && item.outboxId === outboxId)
    const old = state.items.findLastIndex((item, index) => index < retry && item.kind === 'user')

    return old < 0 ? state : { ...state, items: [...state.items.slice(0, old), ...state.items.slice(retry)] }
  })
}

function setOutboxItem(key: string, outboxId: string, change: (item: UserItem) => UserItem) {
  update(key, state => ({
    ...state,
    items: state.items.map(item => (item.kind === 'user' && item.outboxId === outboxId ? change(item) : item))
  }))
}

const isSessionGone = (error: unknown) =>
  error instanceof JsonRpcGatewayError &&
  ((error.data as { reason?: unknown } | undefined)?.reason === 'not_found' || /not found|unknown session/i.test(error.message))

/** Creates a session made on the phone on the gateway, and moves its data to the stored id. */
async function createSession(localKey: string, gateway: GatewayContext): Promise<string> {
  const picked = chatStore(localKey).get().pickedModel
  const answer = await gateway.connection.client.request<CreateAnswer>(
    'session.create',
    picked ? { model: picked.model, ...(picked.provider ? { provider: picked.provider } : {}) } : {}
  )
  const storedId = answer.stored_session_id

  await moveOutboxSession(gateway.db, localKey, storedId)

  const local = chatStore(localKey).get()
  const store = chatStore(storedId)
  store.set({ ...local, key: storedId, storedId, runtimeId: answer.session_id, transcript: 'loaded', model: sessionModel(answer.info) ?? picked ?? null, pickedModel: null })
  // The screen showing the local key follows `storedId` to the new route.
  chatStore(localKey).set({ ...local, storedId })
  byRuntimeId.set(answer.session_id, storedId)
  attached.add(storedId)
  await markOpened(gateway.db, storedId)

  return storedId
}

/** Checks whether a message whose send was cut off reached the gateway. */
async function wasDelivered(entry: OutboxEntry, storedId: string, gateway: GatewayContext): Promise<boolean> {
  const page = await loadTranscriptPage(gateway.rest, storedId)
  const lastUser = [...page.rows].reverse().find(row => row.role === 'user')

  if (!lastUser) {
    return false
  }

  const text = itemsFromRows([lastUser])[0]

  // Allow a few seconds for the phone's and the gateway's clocks to differ.
  return text?.kind === 'user' && text.text.trim() === entry.text.trim() && (lastUser.timestamp ?? 0) >= entry.createdAt - 5
}

let processing: Promise<void> | null = null

/**
 * Sends the outbox in the order the messages were written, one at a time.
 * Runs when the connection opens and after each new message. A message that
 * waited more than 24 hours is held, with the ones after it in its session,
 * until the person chooses "Send now".
 */
export function processOutbox(): Promise<void> {
  processing ??= sendOutbox().finally(() => {
    processing = null
  })

  return processing
}

async function sendOutbox() {
  const gateway = $gateway.get()

  if (!gateway?.connection.isOpen) {
    return
  }

  const held = new Set<string>()
  const now = Date.now() / 1000

  for (const entry of await loadOutbox(gateway.db)) {
    if (!gateway.connection.isOpen || $gateway.get() !== gateway) {
      return
    }

    let key = entry.sessionKey

    if (held.has(key)) {
      continue
    }

    if (now - entry.createdAt > OUTBOX_MAX_AGE_S && !confirmedOld.has(entry.id)) {
      held.add(key)
      setOutboxItem(key, entry.id, item => ({ ...item, state: 'old' }))
      continue
    }

    try {
      if (key.startsWith('local-')) {
        key = await createSession(key, gateway)
      }

      // A Retry has the same text as the message it repeats, so this check can't
      // tell them apart. It's sent again instead: its cut drops a copy that
      // did arrive, along with the old turn.
      if (entry.state === 'uncertain' && !entry.retry) {
        if (await wasDelivered(entry, key, gateway)) {
          await removeFromOutbox(gateway.db, entry.id)
          setOutboxItem(key, entry.id, item => ({ ...item, state: undefined, outboxId: undefined }))
          continue
        }
      }

      if (!chatStore(key).get().runtimeId) {
        await attach(key)
      }

      await submit(key, entry, gateway)
    } catch (error) {
      if (!gateway.connection.isOpen) {
        // Cut off mid-send. The gateway may or may not have the message.
        await setOutboxState(gateway.db, entry.id, entry.state === 'waiting' ? 'uncertain' : entry.state).catch(() => undefined)

        return
      }

      console.warn('Could not send a message', error)
      held.add(key)
      await setOutboxState(gateway.db, entry.id, 'waiting').catch(() => undefined)
      setOutboxItem(key, entry.id, item => ({ ...item, state: 'waiting', sendFailed: true }))
    }
  }
}

async function submit(key: string, entry: OutboxEntry, gateway: GatewayContext, retried = false): Promise<void> {
  const { client } = gateway.connection
  const runtimeId = chatStore(key).get().runtimeId

  await setOutboxState(gateway.db, entry.id, 'sending')
  setOutboxItem(key, entry.id, item => ({ ...item, state: undefined, sendFailed: undefined }))

  let answer: SubmitAnswer
  const cut = entry.retry && runtimeId ? await retryCut(gateway, runtimeId, entry.text) : null

  try {
    const text = runtimeId ? await uploadAttachments(gateway, runtimeId, entry) : entry.text

    answer = await client.request<SubmitAnswer>('prompt.submit', { session_id: runtimeId, text, ...cut }, PROMPT_SUBMIT_TIMEOUT_MS)
  } catch (error) {
    // The Live session was dropped: resume it once and try again.
    if (!retried && isSessionGone(error)) {
      update(key, state => ({ ...state, runtimeId: null }))
      await attach(key)

      return submit(key, entry, gateway, true)
    }

    throw error
  }

  await removeFromOutbox(gateway.db, entry.id)

  if (cut) {
    dropRetriedTurn(key, entry.id)
  }

  setOutboxItem(key, entry.id, item => ({ ...item, outboxId: undefined, state: answer?.status === 'queued' ? 'queued' : undefined }))

  if (answer?.status === 'streaming') {
    update(key, state => ({ ...state, running: true }))
  }

  persistSoon(key)
}

// ------------------------------------------------------------ wiring

let lastEpoch: string | null = null

function wire(gateway: GatewayContext): () => void {
  const { connection } = gateway
  const stopEvents = connection.client.onAny(event => {
    if (event.type === 'gateway.ready') {
      const epoch = (event.payload as { replay_epoch?: unknown } | undefined)?.replay_epoch

      // A new epoch means the gateway restarted. Nothing can be replayed.
      if (typeof epoch === 'string') {
        if (lastEpoch && epoch !== lastEpoch) {
          for (const key of attached) {
            gaps.add(key)
          }
        }

        lastEpoch = epoch
      }

      return
    }

    handleEvent(event)
  })

  let first = true
  const stopStatus = connection.$status.listen(status => {
    if (status !== 'open') {
      return
    }

    void (async () => {
      if (first) {
        first = false
        await markInterruptedSends(gateway.db).catch(() => undefined)
      }

      for (const key of attached) {
        await attach(key).catch((error: unknown) => console.warn('Could not attach again', error))
      }

      await processOutbox()
    })()
  })

  return () => {
    stopEvents()
    stopStatus()
  }
}

let unwire: (() => void) | null = null

onGatewayChange(gateway => {
  unwire?.()
  unwire = null
  stores.clear()
  byRuntimeId.clear()
  attached.clear()
  gaps.clear()
  pending.clear()
  watched.clear()
  subscriptions.clear()
  $canDetach.set(null)
  lastEpoch = null

  if (gateway) {
    unwire = wire(gateway)
  }
})
