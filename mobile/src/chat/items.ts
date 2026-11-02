// What the Session screen draws: one item per bubble, tool row or note.
// Built from the gateway's transcript rows, then kept up to date by the
// streamed events (see stream.ts).

import type { Attachment } from './attachments'
import type { TurnStats } from './turn-stats'

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
  /**
   * Sent while a turn was running, and no turn has started for it yet. The
   * running turn's reply and tool rows are drawn above it.
   */
  duringTurn?: boolean
  outboxId?: string
  /** Photos and files sent with the message from this phone. */
  attachments?: Attachment[]
  /** Sending failed with the gateway reachable, for example because the session was deleted. */
  sendFailed?: boolean
  /** What went to Hermes, when it isn't `text`: a skill command shows "/work fix the leak" and sends the skill's instructions. */
  sentText?: string
}

export interface AssistantItem {
  kind: 'assistant'
  key: string
  text: string
  reasoning?: string
  streaming?: boolean
  /** The turn failed. The desktop's "Turn failed" wording, with this message. */
  error?: string
  /** The person stopped the turn. Set on its last reply, which may have no text. */
  stopped?: boolean
  /** Started because thinking came after text in the same turn. That text is in the reply before this one. */
  afterText?: boolean
  /** How long the turn took and what it used. Set on a turn's last reply, when the phone watched the turn. */
  stats?: TurnStats
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
  /** A slash command's output: the command, such as "/help", shown above `text`. */
  command?: string
}

export type ChatItem = UserItem | AssistantItem | ToolItem | NoteItem

let nextKey = 0

/** A key for an item made on the phone. Items from the gateway use their row id. */
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(nextKey++).toString(36)}`

/**
 * The text of the message the session's last turn answered, once that turn
 * has ended, failed or not. Retry sends it again.
 */
export function lastTurnMessage(items: ChatItem[]): string | null {
  if (!items.length || items.at(-1)?.kind === 'user') {
    return null
  }

  const asked = items.findLast(item => item.kind === 'user')

  return asked ? (asked.sentText ?? asked.text) : null
}

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
  /** On assistant rows: the calls whose results follow as tool rows. */
  tool_calls?: unknown
  row_id?: number | null
  id?: number | null
  timestamp?: number | null
}

function rowKey(row: TranscriptRow, index: number) {
  const rowId = row.row_id ?? row.id

  return rowId == null ? `row-i${index}` : `row-${rowId}`
}

function parsedArgs(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

/**
 * Saved tool rows carry only the result. Their arguments are on the assistant
 * row before them, in `tool_calls` (OpenAI format, arguments as a JSON string).
 */
function storedCallArgs(rows: TranscriptRow[]) {
  const byId = new Map<string, Record<string, unknown>>()

  for (const row of rows) {
    if (row.role !== 'assistant' || !Array.isArray(row.tool_calls)) {
      continue
    }

    for (const call of row.tool_calls as { id?: unknown; function?: { arguments?: unknown } }[]) {
      const args = parsedArgs(call?.function?.arguments)

      if (typeof call?.id === 'string' && args) {
        byId.set(call.id, args)
      }
    }
  }

  return byId
}

/** Turns gateway transcript rows into items. System rows and hidden rows are left out. */
export function itemsFromRows(rows: TranscriptRow[]): ChatItem[] {
  const items: ChatItem[] = []
  const callArgs = storedCallArgs(rows)

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

      case 'tool': {
        const args = row.args ?? (row.tool_call_id ? callArgs.get(row.tool_call_id) : undefined)
        // Like the live rows: the first short string argument, such as a command or a path.
        const firstString = args && typeof args === 'object' ? Object.values(args).find(value => typeof value === 'string') : undefined

        items.push({
          kind: 'tool',
          key,
          toolId: row.tool_call_id ?? key,
          name: row.tool_name || row.name || 'tool',
          context: typeof row.context === 'string' ? row.context : (firstString as string | undefined),
          args,
          result: text,
          running: false,
          rowId
        })

        return
      }
    }
  })

  return items
}
