// Applies streamed gateway events to a session's items. A trimmed port of the
// desktop's handlers in apps/desktop/src/app/session/hooks/use-message-stream/
// (gateway-event/message-stream.ts for message.* and reasoning.*, tools.ts
// for tool.*, status.ts for status.update). Kept as plain functions so they
// can be tested without a screen.

import { type AssistantItem, type ChatItem, gatewayText, newKey, type ToolItem } from './items'

export interface StreamState {
  items: ChatItem[]
  /** A turn is running. The message box shows Stop. */
  running: boolean
  /** A short status line from `status.update`, shown while the turn runs. */
  status: string | null
  title: string | null
}

type Payload = Record<string, unknown> | undefined

const text = (value: unknown) => gatewayText(value)

/** The assistant bubble that is still being written, if it's the last item. */
function streamingIndex(items: ChatItem[]): number {
  const last = items.length - 1

  return last >= 0 && items[last].kind === 'assistant' && (items[last] as AssistantItem).streaming ? last : -1
}

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  const copy = list.slice()
  copy[index] = value

  return copy
}

/** Closes the bubble being written. An empty one is dropped. */
function sealStreaming(items: ChatItem[]): ChatItem[] {
  const index = streamingIndex(items)

  if (index < 0) {
    return items
  }

  const bubble = items[index] as AssistantItem

  if (!bubble.text && !bubble.reasoning && !bubble.error) {
    return items.slice(0, index)
  }

  return replaceAt(items, index, { ...bubble, streaming: false })
}

function withStreaming(items: ChatItem[]): [ChatItem[], number] {
  const index = streamingIndex(items)

  if (index >= 0) {
    return [items, index]
  }

  return [[...items, { kind: 'assistant', key: newKey('reply'), text: '', streaming: true }], items.length]
}

/** Appends streamed reply text. Several deltas are joined before this is called. */
export function appendReply(state: StreamState, delta: string): StreamState {
  if (!delta) {
    return state
  }

  const [items, index] = withStreaming(state.items)
  const bubble = items[index] as AssistantItem

  return { ...state, items: replaceAt(items, index, { ...bubble, text: bubble.text + delta }) }
}

export function appendReasoning(state: StreamState, delta: string, replace = false): StreamState {
  if (!delta && !replace) {
    return state
  }

  const [items, index] = withStreaming(state.items)
  const bubble = items[index] as AssistantItem

  return {
    ...state,
    items: replaceAt(items, index, { ...bubble, reasoning: replace ? delta : (bubble.reasoning ?? '') + delta })
  }
}

function upsertTool(items: ChatItem[], toolId: string, update: (tool: ToolItem | null) => ToolItem): ChatItem[] {
  const index = items.findIndex(item => item.kind === 'tool' && item.toolId === toolId)

  if (index >= 0) {
    return replaceAt(items, index, update(items[index] as ToolItem))
  }

  // A tool call ends the bubble written before it.
  return [...sealStreaming(items), update(null)]
}

const optionalText = (value: unknown) => {
  const found = text(value)

  return found ? found : undefined
}

/**
 * Applies one event that isn't a text delta. Returns the state unchanged for
 * events it doesn't know. `message.delta` and `reasoning.delta` go through
 * `appendReply` and `appendReasoning`, batched once per frame.
 */
export function applyEvent(state: StreamState, type: string, payload: Payload): StreamState {
  switch (type) {
    case 'message.start': {
      // The oldest queued message is the one this turn answers.
      const queued = state.items.findIndex(item => item.kind === 'user' && item.state === 'queued')
      const items = queued >= 0 ? replaceAt(state.items, queued, { ...state.items[queued], state: undefined } as ChatItem) : state.items

      return { ...state, items: sealStreaming(items), running: true, status: null }
    }

    case 'message.interim': {
      // Text written before a tool call, closed off as its own bubble.
      const interim = text(payload?.text)
      const index = streamingIndex(state.items)

      if (index >= 0) {
        const bubble = state.items[index] as AssistantItem

        return { ...state, items: sealStreaming(replaceAt(state.items, index, { ...bubble, text: interim || bubble.text })) }
      }

      return interim ? { ...state, items: [...state.items, { kind: 'assistant', key: newKey('reply'), text: interim }] } : state
    }

    case 'reasoning.available':
      return appendReasoning(state, text(payload?.text), true)

    case 'tool.generating':
      // Sent while the model is still writing the call. It has a name but no
      // id, so a row made from it would never match the tool.start that follows.
      return state

    case 'tool.start':
    case 'tool.progress':
    case 'tool.complete': {
      const toolId = text(payload?.tool_id) || newKey('tool')
      const done = type === 'tool.complete'

      return {
        ...state,
        items: upsertTool(state.items, toolId, tool => ({
          kind: 'tool',
          key: tool?.key ?? newKey('tool'),
          toolId,
          name: text(payload?.name) || tool?.name || 'tool',
          context: optionalText(payload?.context) ?? tool?.context,
          args: payload?.args ?? tool?.args,
          summary: done ? (optionalText(payload?.summary) ?? tool?.summary) : (optionalText(payload?.message) ?? tool?.summary),
          result: optionalText(payload?.result_text) ?? tool?.result,
          diff: optionalText(payload?.inline_diff) ?? tool?.diff,
          running: !done,
          rowId: tool?.rowId
        }))
      }
    }

    case 'message.complete': {
      const finalText = text(payload?.text)
      const failed = payload?.status === 'error'
      const error = failed ? text(payload?.error) || finalText || 'Hermes reported an error' : undefined
      let items = state.items
      const index = streamingIndex(items)

      if (index >= 0) {
        const bubble = items[index] as AssistantItem
        const kept = failed && !payload?.partial ? bubble.text : finalText || bubble.text
        items = replaceAt(items, index, { ...bubble, text: kept, error, streaming: false })
      } else {
        const lastReply = [...items].reverse().find(item => item.kind === 'assistant') as AssistantItem | undefined
        const alreadyShown = finalText && lastReply?.text.trim() === finalText.trim()

        if ((finalText && !alreadyShown && !failed) || error) {
          items = [...items, { kind: 'assistant', key: newKey('reply'), text: failed ? '' : finalText, error }]
        }
      }

      // A stopped turn can leave tools marked as running.
      items = sealStreaming(items).map(item => (item.kind === 'tool' && item.running ? { ...item, running: false } : item))

      return { ...state, items, running: false, status: null }
    }

    case 'status.update':
      return { ...state, status: optionalText(payload?.text) ?? null }

    case 'error': {
      const message = text(payload?.message)

      return message
        ? { ...state, items: [...state.items, { kind: 'note', key: newKey('note'), text: message, tone: 'error' }] }
        : state
    }

    case 'session.title':
      return { ...state, title: optionalText(payload?.title) ?? state.title }

    default:
      return state
  }
}

/**
 * Rebuilds the reply in progress after opening a session whose turn is
 * running, from the resume answer's `inflight`.
 */
export function withInflight(state: StreamState, inflight: { user?: string; assistant?: string } | null | undefined): StreamState {
  if (!inflight) {
    return { ...state, running: true }
  }

  let items = state.items
  const lastUser = [...items].reverse().find(item => item.kind === 'user')

  if (inflight.user && lastUser?.text.trim() !== inflight.user.trim()) {
    items = [...items, { kind: 'user', key: newKey('user'), text: inflight.user }]
  }

  items = [...sealStreaming(items), { kind: 'assistant', key: newKey('reply'), text: inflight.assistant ?? '', streaming: true }]

  return { ...state, items, running: true }
}
