// Approvals and Questions: the cards above the message box. A trimmed port of
// the desktop's apps/desktop/src/store/prompts.ts (the approval queue),
// apps/desktop/src/store/clarify.ts, and the `approval` and `clarify` handlers
// in apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/server-requests.ts.
// See GATEWAY_PROTOCOL.md, section 9.
//
// Cards are keyed by chat key (the stored id). They're removed when answered,
// cancelled, timed out, missing from a resume's open requests, or answered on
// another device (checked when the turn moves on).

import { APPROVAL_RESPOND_TIMEOUT_MS } from '@hermes/shared/json-rpc-gateway'
import type { ServerRequest } from '@hermes/shared/json-rpc-channel'
import { atom } from 'nanostores'

import { t } from '@/i18n/t'

import { addNote, attach, chatStore, keyForRuntimeId, onOpenRequests, onSessionEvent } from './chat'
import { $gateway, type GatewayContext, onGatewayChange } from './gateway'
import { setLocalMarker } from './sessions'

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny'

export interface ApprovalCard {
  /** The server request's id, or null for an Approval found through `approval.pending`. */
  requestId: string | null
  /** The approval queue's own id (`params.request_id`), for `approval.respond`. */
  approvalId: string
  command: string
  description: string
  choices: ApprovalChoice[]
  /** The pattern "Always allow" adds to the allowlist. */
  pattern: string
  arrivedAt: number
}

export interface ClarifyQuestion {
  qid: string
  question: string
  choices?: string[] | null
  multi_select?: boolean
}

export type Answer = string | string[] | null

export interface QuestionCard {
  requestId: string
  questions: ClarifyQuestion[]
  /** Answers so far, by question id. A missing key means not answered yet; null means skipped. */
  answers: Record<string, Answer>
  /** The question on screen. */
  index: number
  arrivedAt: number
}

export interface SessionPrompts {
  approvals: ApprovalCard[]
  question: QuestionCard | null
}

const EMPTY: SessionPrompts = { approvals: [], question: null }

export const $prompts = atom<Record<string, SessionPrompts>>({})

/** The live server requests, by id, so a card can be answered on the request itself. */
const liveRequests = new Map<string, ServerRequest>()

export const promptsFor = (key: string): SessionPrompts => $prompts.get()[key] ?? EMPTY

/** True while the session has a card waiting: the Needs input state. */
export const needsInput = (key: string) => {
  const prompts = promptsFor(key)

  return prompts.approvals.length > 0 || prompts.question !== null
}

/** Called after every change: listeners such as notifications watch it. */
type PromptListener = (key: string, prompts: SessionPrompts) => void
const listeners = new Set<PromptListener>()

export function onPromptsChange(listener: PromptListener): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function setPrompts(key: string, change: (prompts: SessionPrompts) => SessionPrompts) {
  const next = change(promptsFor(key))
  const all = { ...$prompts.get() }

  if (next.approvals.length === 0 && next.question === null) {
    delete all[key]
  } else {
    all[key] = next
  }

  $prompts.set(all)

  const chat = chatStore(key).get()

  if (chat.storedId) {
    setLocalMarker(chat.storedId, needsInput(key) ? 'needs-input' : chat.running ? 'running' : null)
  }

  for (const listener of listeners) {
    listener(key, next)
  }
}

const APPROVAL_CHOICES: ApprovalChoice[] = ['once', 'session', 'always', 'deny']

function approvalFromParams(params: Record<string, unknown>, requestId: string | null): ApprovalCard {
  const offered = Array.isArray(params.choices)
    ? APPROVAL_CHOICES.filter(choice => (params.choices as unknown[]).includes(choice))
    : APPROVAL_CHOICES
  const choices = offered.filter(
    choice => !(choice === 'always' && params.allow_permanent === false) && !(choice === 'session' && params.allow_session === false)
  )
  const command = typeof params.command === 'string' ? params.command : ''

  return {
    requestId,
    approvalId: typeof params.request_id === 'string' ? params.request_id : (requestId ?? ''),
    command,
    description: typeof params.description === 'string' ? params.description : '',
    choices: choices.includes('deny') ? choices : [...choices, 'deny'],
    pattern: typeof params.pattern_key === 'string' && params.pattern_key ? params.pattern_key : command,
    arrivedAt: Date.now()
  }
}

// ------------------------------------------------------------ receiving

const SHOWN_REQUESTS = new Set(['approval', 'clarify'])

/**
 * Handles every server request. Approvals and Questions become cards. Every
 * other request is declined as "not shown here", so a laptop with the same
 * session open can still answer it.
 */
function handleRequest(request: ServerRequest, gateway: GatewayContext): boolean {
  const key = keyForRuntimeId(request.params.session_id)

  if (!SHOWN_REQUESTS.has(request.method) || !key) {
    decline(request, gateway)

    return true
  }

  liveRequests.set(request.id, request)

  if (request.method === 'approval') {
    const card = approvalFromParams(request.params, request.id)

    setPrompts(key, prompts => {
      const known = prompts.approvals.some(found => found.requestId === request.id || found.approvalId === card.approvalId)

      return known
        ? { ...prompts, approvals: prompts.approvals.map(found => (found.approvalId === card.approvalId ? { ...found, requestId: request.id } : found)) }
        : { ...prompts, approvals: [...prompts.approvals, card] }
    })
  } else {
    const questions = (Array.isArray(request.params.questions) ? request.params.questions : []) as ClarifyQuestion[]
    // After a reconnect, a replayed request can carry answers already locked in.
    const locked = (request.params.answers ?? {}) as Record<string, Answer>

    setPrompts(key, prompts =>
      prompts.question?.requestId === request.id
        ? prompts
        : {
            ...prompts,
            question: {
              requestId: request.id,
              questions,
              answers: { ...locked },
              index: Math.max(0, questions.findIndex(question => !(question.qid in locked))),
              arrivedAt: Date.now()
            }
          }
    )
  }

  return true
}

function decline(request: ServerRequest, gateway: GatewayContext) {
  if (gateway.connection.declinesNotShown) {
    // The same frame the shared channel's `decline()` sends: error code 4404.
    request.fail(4404, 'not shown here')
  } else {
    request.fail(-32601, `no handler for server request: ${request.method}`)
  }
}

// ------------------------------------------------------------ answering

function removeApproval(key: string, approvalId: string) {
  setPrompts(key, prompts => ({ ...prompts, approvals: prompts.approvals.filter(card => card.approvalId !== approvalId) }))
}

/** Answers the first Approval in a session's stack. "Always allow" is confirmed by the card first. */
export async function answerApproval(key: string, card: ApprovalCard, choice: ApprovalChoice) {
  const gateway = $gateway.get()
  const live = card.requestId ? liveRequests.get(card.requestId) : undefined

  if (!gateway?.connection.isOpen) {
    throw new Error(t('assistant.approval.gatewayDisconnected'))
  }

  removeApproval(key, card.approvalId)

  if (live) {
    live.respond({ choice })
    liveRequests.delete(live.id)

    return
  }

  // Found through `approval.pending`, with no live request to answer.
  const runtimeId = chatStore(key).get().runtimeId
  const params = { session_id: runtimeId, request_id: card.approvalId, choice }

  try {
    await gateway.connection.client.request('approval.respond', params, APPROVAL_RESPOND_TIMEOUT_MS + 30_000)
  } catch (error) {
    if (!/timed out/i.test(String(error))) {
      throw error
    }

    // Answering twice is harmless: the second answer resolves nothing.
    await gateway.connection.client.request('approval.respond', params, APPROVAL_RESPOND_TIMEOUT_MS + 30_000)
  }
}

/** Moves to another question, keeping the answers so far. */
export function showQuestion(key: string, index: number) {
  setPrompts(key, prompts =>
    prompts.question ? { ...prompts, question: { ...prompts.question, index: Math.max(0, Math.min(index, prompts.question.questions.length - 1)) } } : prompts
  )
}

/** Records the answer to the question on screen. */
export function setAnswer(key: string, answer: Answer) {
  setPrompts(key, prompts => {
    const question = prompts.question

    if (!question) {
      return prompts
    }

    const qid = question.questions[question.index]?.qid

    return qid ? { ...prompts, question: { ...question, answers: { ...question.answers, [qid]: answer } } } : prompts
  })
}

/** Sends every answer at once. Questions with no answer are sent as skipped. */
export function sendAnswers(key: string) {
  const question = promptsFor(key).question
  const live = question ? liveRequests.get(question.requestId) : undefined

  if (!question) {
    return
  }

  const answers: Record<string, Answer> = {}

  for (const { qid } of question.questions) {
    const answer = question.answers[qid]
    answers[qid] = answer === undefined || (typeof answer === 'string' && !answer.trim()) || (Array.isArray(answer) && !answer.length) ? null : answer
  }

  live?.respond({ answers })
  liveRequests.delete(question.requestId)
  setPrompts(key, prompts => ({ ...prompts, question: null }))
}

/** Cancels every question: a response without answers. */
export function cancelQuestions(key: string) {
  const question = promptsFor(key).question

  if (question) {
    liveRequests.get(question.requestId)?.respond({})
    liveRequests.delete(question.requestId)
    setPrompts(key, prompts => ({ ...prompts, question: null }))
  }
}

// ------------------------------------------------------------ clearing

function removeRequest(requestId: string): { key: string; wasApproval: boolean } | null {
  liveRequests.delete(requestId)

  for (const [key, prompts] of Object.entries($prompts.get())) {
    const approval = prompts.approvals.find(card => card.requestId === requestId || card.approvalId === requestId)

    if (approval) {
      removeApproval(key, approval.approvalId)

      return { key, wasApproval: true }
    }

    if (prompts.question?.requestId === requestId) {
      setPrompts(key, current => ({ ...current, question: null }))

      return { key, wasApproval: false }
    }
  }

  return null
}

/** Drops every card of a session, as the desktop does when its turn ends. */
export function clearPrompts(key: string) {
  const prompts = promptsFor(key)

  for (const card of prompts.approvals) {
    if (card.requestId) liveRequests.delete(card.requestId)
  }

  if (prompts.question) liveRequests.delete(prompts.question.requestId)

  if (prompts.approvals.length || prompts.question) {
    setPrompts(key, () => EMPTY)
  }
}

const checks = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * The gateway doesn't tell the phone when the laptop answers. So when the
 * turn moves on after a card arrived, ask which requests are still open and
 * drop the rest: `approval.pending` for Approvals, a resume for a Question.
 */
function checkAnsweredElsewhere(key: string) {
  if (checks.has(key)) {
    return
  }

  checks.set(
    key,
    setTimeout(() => {
      checks.delete(key)
      void (async () => {
        const gateway = $gateway.get()
        const runtimeId = chatStore(key).get().runtimeId
        const prompts = promptsFor(key)

        if (!gateway?.connection.isOpen || !runtimeId) {
          return
        }

        if (prompts.approvals.length) {
          const answer = await gateway.connection.client
            .request<{ approvals?: Record<string, unknown>[] } | null>('approval.pending', { session_id: runtimeId })
            .catch(() => null)

          if (answer) {
            const open = answer.approvals ?? []
            const openIds = new Set(open.map(approval => approval.request_id))

            setPrompts(key, current => {
              const kept = current.approvals.filter(card => openIds.has(card.approvalId))
              const keptIds = new Set(kept.map(card => card.approvalId))
              const restored = open
                .filter(approval => typeof approval.request_id === 'string' && !keptIds.has(approval.request_id))
                .map(approval => approvalFromParams(approval, null))

              return { ...current, approvals: [...kept, ...restored] }
            })
          }
        }

        if (prompts.question) {
          // A resume's open requests are passed to `onOpenRequests` below.
          await attach(key).catch(() => undefined)
        }
      })()
    }, 300)
  )
}

const MOVED_ON = new Set(['message.delta', 'tool.start', 'tool.complete', 'reasoning.delta'])

function handleSessionEvent(key: string, type: string, payload: Record<string, unknown> | undefined) {
  switch (type) {
    case 'message.complete':
      clearPrompts(key)

      return

    case 'request.cancel': {
      const id = payload?.id

      if (typeof id === 'string') {
        const removed = removeRequest(id)

        if (removed?.wasApproval && payload?.reason === 'timeout') {
          addNote(removed.key, t('app.approval.timedOut'))
        }
      }

      return
    }

    case 'approval.cancelled': {
      const ids = Array.isArray(payload?.request_ids) ? (payload.request_ids as unknown[]) : []

      for (const id of ids) {
        if (typeof id === 'string') {
          removeRequest(id)
        }
      }

      return
    }
  }

  if (MOVED_ON.has(type) && needsInput(key)) {
    checkAnsweredElsewhere(key)
  }
}

// ------------------------------------------------------------ wiring

function wire(gateway: GatewayContext): () => void {
  const stopRequests = gateway.connection.client.onRequest(request => handleRequest(request, gateway))

  // `request.cancel` and `approval.cancelled` may name no session.
  const stopCancels = gateway.connection.client.onAny(event => {
    if ((event.type === 'request.cancel' || event.type === 'approval.cancelled') && !keyForRuntimeId(event.session_id)) {
      handleSessionEvent('', event.type, event.payload as Record<string, unknown> | undefined)
    }
  })

  const stopEvents = onSessionEvent((key, event) => handleSessionEvent(key, event.type, event.payload as Record<string, unknown> | undefined))

  // A resume lists the requests still open; any other card was settled while away.
  const stopOpen = onOpenRequests((key, open) => {
    const ids = new Set(open.map(request => request.id))
    const prompts = promptsFor(key)
    const stale = [
      ...prompts.approvals.filter(card => card.requestId && !ids.has(card.requestId)).map(card => card.requestId!),
      ...(prompts.question && !ids.has(prompts.question.requestId) ? [prompts.question.requestId] : [])
    ]

    for (const id of stale) {
      removeRequest(id)
    }
  })

  return () => {
    stopRequests()
    stopCancels()
    stopEvents()
    stopOpen()
  }
}

let unwire: (() => void) | null = null

onGatewayChange(gateway => {
  unwire?.()
  unwire = null
  liveRequests.clear()
  $prompts.set({})

  if (gateway) {
    unwire = wire(gateway)
  }
})
