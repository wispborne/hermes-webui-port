// How long each turn took and what it used. The gateway only sends the
// session's running totals (`usage` on `message.complete`, the desktop
// status bar's numbers), so a turn's own numbers are the totals at its end
// minus the totals at its start. The time is measured on the phone, like the
// desktop's "⏱ 18s" under a reply. The gateway doesn't save any of this, so
// only turns the phone watched have stats.

import type { AssistantItem, ChatItem } from './items'

/** The session's running totals, from the gateway's `Usage`. */
export interface SessionTotals {
  input?: number
  output?: number
  reasoning?: number
  cacheRead?: number
  calls?: number
  costUsd?: number
}

/** What one turn took. A number is left out when the phone can't tell. */
export interface TurnStats {
  seconds?: number
  /** Output tokens per second, over the time Hermes wasn't running tools. */
  tokensPerSecond?: number
  input?: number
  output?: number
  reasoning?: number
  cacheRead?: number
  calls?: number
  costUsd?: number
}

/** A turn being measured, from `message.start`. */
export interface TurnClock {
  startedAt: number
  /** Time spent running tools, from each `tool.complete`'s `duration_s`. */
  toolSeconds: number
  /** The totals when the turn started. Null when the phone doesn't know them. */
  before: SessionTotals | null
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

/** The totals in a gateway `Usage`, or null when it has none. */
export function sessionTotals(usage: unknown): SessionTotals | null {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const u = usage as Record<string, unknown>
  const totals: SessionTotals = {
    input: count(u.input),
    output: count(u.output),
    reasoning: count(u.reasoning),
    cacheRead: count(u.cache_read),
    calls: count(u.calls),
    costUsd: count(u.cost_usd)
  }

  return Object.values(totals).some(value => value !== undefined) ? totals : null
}

/** Newer totals over older ones. A gateway can send only some of them. */
export function mergeTotals(older: SessionTotals | null | undefined, newer: SessionTotals | null): SessionTotals | null {
  if (!newer) {
    return older ?? null
  }

  const merged = { ...older }

  for (const [name, value] of Object.entries(newer) as [keyof SessionTotals, number | undefined][]) {
    if (value !== undefined) {
      merged[name] = value
    }
  }

  return merged
}

/** Zero totals, for a session that has had no turns. */
export const NO_TOTALS: SessionTotals = { input: 0, output: 0, reasoning: 0, cacheRead: 0, calls: 0, costUsd: 0 }

/** The turn's stats, or null when there's nothing to show. */
export function turnStats(clock: TurnClock, after: SessionTotals | null, now: number): TurnStats | null {
  const stats: TurnStats = {}
  const seconds = Math.max(0, (now - clock.startedAt) / 1000)

  if (seconds > 0) {
    stats.seconds = seconds
  }

  if (clock.before && after) {
    const before = clock.before
    const used = (name: keyof SessionTotals) => {
      const end = after[name]
      const start = before[name]

      // A count that went down was reset, for example by compression, so it says nothing about this turn.
      return end !== undefined && start !== undefined && end >= start ? end - start : undefined
    }

    stats.input = used('input')
    stats.output = used('output')
    stats.reasoning = used('reasoning') || undefined
    stats.cacheRead = used('cacheRead') || undefined
    stats.calls = used('calls')
    stats.costUsd = used('costUsd') || undefined

    const writing = seconds - clock.toolSeconds

    if (stats.output && writing >= 1) {
      stats.tokensPerSecond = stats.output / writing
    }
  }

  for (const name of Object.keys(stats) as (keyof TurnStats)[]) {
    if (stats[name] === undefined) {
      delete stats[name]
    }
  }

  return Object.keys(stats).length ? stats : null
}

/**
 * Puts the stats on the turn's last reply. The turn is everything after the
 * last message sent, so a turn with no reply of its own gets none.
 */
export function withTurnStats(items: ChatItem[], stats: TurnStats | null): ChatItem[] {
  if (!stats) {
    return items
  }

  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]

    if (item.kind === 'user') {
      return items
    }

    if (item.kind === 'assistant') {
      const copy = items.slice()
      copy[index] = { ...item, stats }

      return copy
    }
  }

  return items
}

/**
 * Moves stats from the items shown onto the gateway's rows that replace them.
 * The gateway's rows have no stats, so a reply's stats would be lost each time
 * the transcript reloads. A reply is matched by its text, newest first.
 */
export function keepStats(shown: ChatItem[], fresh: ChatItem[]): ChatItem[] {
  const withStats = shown.filter((item): item is AssistantItem => item.kind === 'assistant' && Boolean(item.stats) && Boolean(item.text.trim()))

  if (!withStats.length) {
    return fresh
  }

  const result = fresh.slice()
  let searchFrom = result.length - 1

  for (const old of withStats.reverse()) {
    for (let index = searchFrom; index >= 0; index--) {
      const item = result[index]

      if (item.kind === 'assistant' && item.text.trim() === old.text.trim()) {
        result[index] = { ...item, stats: old.stats }
        searchFrom = index - 1
        break
      }
    }
  }

  return result
}

/** "18s", "4m 05s" or "1h 02m". */
export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds)

  if (seconds < 10) {
    return `${Math.round(seconds * 10) / 10}s`
  }

  if (whole < 60) {
    return `${whole}s`
  }

  const minutes = Math.floor(whole / 60)

  if (minutes < 60) {
    return `${minutes}m ${String(whole % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** "950", "12.4k" or "1.2M". */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return String(Math.round(tokens))
  }

  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 100) / 10}k`
  }

  return `${Math.round(tokens / 100_000) / 10}M`
}

/** "$0.0042", "$0.008" or "$1.23". */
export function formatCost(usd: number): string {
  return usd < 0.01 ? `$${Number(usd.toPrecision(2))}` : `$${usd.toFixed(2)}`
}
