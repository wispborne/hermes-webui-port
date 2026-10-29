/**
 * Reads the text replies of the gateway's `/memory` command. The gateway has
 * no JSON route for pending memory writes, so this is the only way to list
 * them. The formats come from hermes-agent's
 * hermes_cli/write_approval_commands.py and tools/memory_tool.py; keep every
 * format detail in this file so an upstream change needs one fix here.
 */

export type MemoryWriteAction = 'add' | 'batch' | 'patch' | 'remove' | 'replace' | 'unknown'

export type MemoryWriteTarget = 'memory' | 'user'

/** An existing entry a patch, remove or replace would change, in full.
 *  `text` is null for an old write staged before entries were pinned. */
export interface MemoryWriteEntry {
  action: string
  text: null | string
}

export interface PendingMemoryWrite {
  id: string
  /** Staged by Hermes's background review rather than a chat turn. */
  background: boolean
  action: MemoryWriteAction
  target: MemoryWriteTarget | null
  /** The summary as printed, after the id. */
  summary: string
  /** The summary without its "add to memory:"-style label. */
  detail: string
  /** The gateway shortens summaries, so the end of the text may be missing. */
  maybeCut: boolean
  entries: MemoryWriteEntry[]
}

export interface MemoryReview {
  /** `memory.write_approval`; null when the reply didn't include it. */
  approvalOn: boolean | null
  writes: PendingMemoryWrite[]
}

// Foreground summaries keep 120 characters of detail; background ones are cut
// to 200 characters in all (tools/memory_tool.py).
const DETAIL_LIMIT = 120
const BACKGROUND_LIMIT = 200

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g
const STATE_LINE = /^memory\.write_approval = (on|off)$/
const EMPTY_LINE = 'No pending memory writes.'
const LIST_HEADER = /^Pending memory writes \(\d+\):$/
const FOOTER = /^Apply: \/memory approve /
const ROW = /^ {2}([0-9a-f]{6,32})( \[auto\])? {2}(.*)$/
const PINNED_ENTRY = /^ {6}([a-z]+?)s entry: (.*)$/
const UNPINNED_ENTRY = /^ {6}([a-z]+): unpinned legacy target/
const FOREGROUND_LABEL = /^(add to|replace in|remove from|patch in|apply \d+ op\(s\) to) (memory|user profile): /
const BACKGROUND_LABEL = /^background review consolidation \((add|batch|patch|remove|replace) on (memory|user)\): /

const LABEL_ACTIONS: Record<string, MemoryWriteAction> = {
  'add to': 'add',
  'patch in': 'patch',
  'remove from': 'remove',
  'replace in': 'replace'
}

function cleanLines(text: string): string[] {
  return text.replace(ANSI, '').replace(/\r\n?/g, '\n').split('\n')
}

function readSummary(summary: string): Pick<PendingMemoryWrite, 'action' | 'detail' | 'maybeCut' | 'target'> {
  const background = BACKGROUND_LABEL.exec(summary)

  if (background) {
    return {
      action: background[1] as MemoryWriteAction,
      detail: summary.slice(background[0].length),
      maybeCut: summary.length >= BACKGROUND_LIMIT,
      target: background[2] as MemoryWriteTarget
    }
  }

  const foreground = FOREGROUND_LABEL.exec(summary)

  if (foreground) {
    const detail = summary.slice(foreground[0].length)

    return {
      action: LABEL_ACTIONS[foreground[1]] ?? 'batch',
      detail,
      maybeCut: detail.length >= DETAIL_LIMIT,
      target: foreground[2] === 'memory' ? 'memory' : 'user'
    }
  }

  return { action: 'unknown', detail: summary, maybeCut: false, target: null }
}

/** Reads the reply to `/memory` or `/memory pending`. Returns null when the
 *  reply is neither, so the caller can show it as it is. */
export function parseMemoryReview(text: string): MemoryReview | null {
  let approvalOn: boolean | null = null
  let sawList = false
  const rows: { background: boolean; entries: MemoryWriteEntry[]; id: string; summary: string[] }[] = []

  for (const line of cleanLines(text)) {
    const state = STATE_LINE.exec(line)

    if (state) {
      approvalOn = state[1] === 'on'

      continue
    }

    if (line === EMPTY_LINE || LIST_HEADER.test(line)) {
      sawList = true

      continue
    }

    if (!sawList) {
      continue
    }

    if (FOOTER.test(line)) {
      break
    }

    const row = ROW.exec(line)

    if (row) {
      rows.push({ background: Boolean(row[2]), entries: [], id: row[1], summary: [row[3]] })

      continue
    }

    const current = rows.at(-1)

    if (!current) {
      continue
    }

    const pinned = PINNED_ENTRY.exec(line)
    const unpinned = pinned ? null : UNPINNED_ENTRY.exec(line)

    if (pinned) {
      current.entries.push({ action: pinned[1], text: pinned[2] })
    } else if (unpinned) {
      current.entries.push({ action: unpinned[1], text: null })
    } else {
      // A summary or entry can hold line breaks; the rest of it follows unindented.
      const last = current.entries.at(-1)

      if (last?.text != null) {
        last.text += `\n${line}`
      } else if (!last) {
        current.summary.push(line)
      }
    }
  }

  if (!sawList) {
    return null
  }

  const writes = rows.map(row => {
    // The blank line before the footer belongs to the footer, not the last row.
    const summary = row.summary.join('\n').replace(/\n+$/, '')

    const entries = row.entries.map(entry =>
      entry.text === null ? entry : { ...entry, text: entry.text.replace(/\n+$/, '') }
    )

    return { background: row.background, entries, id: row.id, summary, ...readSummary(summary) }
  })

  return { approvalOn, writes }
}

/** Reads the reply to `/memory approval on|off`: the new setting, or null
 *  when it didn't change. */
export function parseApprovalReply(text: string): boolean | null {
  const match = /memory\.write_approval set to '(on|off)'/.exec(text.replace(ANSI, ''))

  return match ? match[1] === 'on' : null
}

const FAILED_REPLY = /^(No pending memory write|Usage: |Unknown |Failed to set |Invalid value )/m

/** True when an approve, reject or approval reply says nothing happened or
 *  something went wrong. */
export function replyFailed(text: string): boolean {
  const clean = text.replace(ANSI, '').trim()

  return !clean || FAILED_REPLY.test(clean) || /^Failed:$/m.test(clean)
}
