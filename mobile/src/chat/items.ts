// What the Session screen draws: one item per bubble, tool row or note.
// Built from the gateway's transcript rows, then kept up to date by the
// streamed events (see stream.ts).

export interface UserItem {
  kind: 'user'
  key: string
  text: string
  rowId?: number
  /**
   * - `queued`: sent while a turn was running; Hermes reads it when that turn ends
   * - `waiting`: in the outbox, waiting for the gateway
   * - `old`: in the outbox for more than 24 hours; asks before it's sent
   */
  state?: 'queued' | 'waiting' | 'old'
  outboxId?: string
  /** Sending failed with the gateway reachable, for example because the session was deleted. */
  sendFailed?: boolean
}

export interface AssistantItem {
  kind: 'assistant'
  key: string
  text: string
  reasoning?: string
  streaming?: boolean
  /** The turn failed. The desktop's "Turn failed" wording, with this message. */
  error?: string
  rowId?: number
}

export interface ToolItem {
  kind: 'tool'
  key: string
  toolId: string
  name: string
  /** A short preview of the arguments, such as the file path. */
  context?: string
  args?: unknown
  summary?: string
  result?: string
  diff?: string
  running: boolean
  rowId?: number
}

/** A line in the transcript that isn't a message, such as a status or the timed-out note. */
export interface NoteItem {
  kind: 'note'
  key: string
  text: string
  tone?: 'error' | 'info'
}

export type ChatItem = UserItem | AssistantItem | ToolItem | NoteItem

let nextKey = 0

/** A key for an item made on the phone. Items from the gateway use their row id. */
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextKey++).toString(36)}`

/** Text from a gateway field that may be a string, a list of parts, or something else. */
export function gatewayText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map(part => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .join('')
  }

  return ''
}

/** One row of `GET /api/sessions/{id}/messages` or of a resume's `messages`. */
export interface TranscriptRow {
  role: string
  content?: unknown
  text?: unknown
  display_content?: unknown
  display_kind?: string | null
  reasoning?: string | null
  display_reasoning?: string | null
  name?: string | null
  tool_name?: string | null
  tool_call_id?: string | null
  context?: unknown
  args?: unknown
  row_id?: number | null
  id?: number | null
  timestamp?: number | null
}

function rowKey(row: TranscriptRow, index: number) {
  const rowId = row.row_id ?? row.id

  return rowId == null ? `row-i${index}` : `row-${rowId}`
}

/** Turns gateway transcript rows into items. System rows and hidden rows are left out. */
export function itemsFromRows(rows: TranscriptRow[]): ChatItem[] {
  const items: ChatItem[] = []

  rows.forEach((row, index) => {
    const rowId = row.row_id ?? row.id ?? undefined
    const key = rowKey(row, index)

    if (row.display_kind === 'hidden') {
      return
    }

    const text = gatewayText(row.display_content) || gatewayText(row.text) || gatewayText(row.content)

    switch (row.role) {
      case 'user':
        if (text) {
          items.push({ kind: 'user', key, text, rowId })
        }

        return

      case 'assistant': {
        const reasoning = row.display_reasoning || row.reasoning || undefined

        if (text || reasoning) {
          items.push({ kind: 'assistant', key, text, reasoning, rowId })
        }

        return
      }

      case 'tool':
        items.push({
          kind: 'tool',
          key,
          toolId: row.tool_call_id ?? key,
          name: row.tool_name || row.name || 'tool',
          context: typeof row.context === 'string' ? row.context : undefined,
          args: row.args,
          result: text,
          running: false,
          rowId
        })

        return
    }
  })

  return items
}
