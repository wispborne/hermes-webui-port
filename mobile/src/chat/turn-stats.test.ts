import type { AssistantItem, ChatItem } from './items'
import { applyEvent, type StreamState } from './stream'
import { formatCost, formatSeconds, formatTokens, keepStats, turnStats } from './turn-stats'

const asked: ChatItem = { kind: 'user', key: 'u1', text: 'Hi' }
const start: StreamState = { items: [asked], running: false, status: null, title: null }

type Step = [type: string, payload: Record<string, unknown> | undefined, at: number]

/** Plays events at the given times, in milliseconds. */
const play = (steps: Step[], from = start) => steps.reduce((state, [type, payload, at]) => applyEvent(state, type, payload, at), from)

const lastReply = (state: StreamState) => state.items.findLast(item => item.kind === 'assistant') as AssistantItem | undefined

describe('turn stats', () => {
  it("measures a turn's time, and its tokens from the change in the session's totals", () => {
    const state = play(
      [
        ['message.start', {}, 0],
        ['tool.start', { tool_id: 't1', name: 'terminal' }, 1000],
        ['tool.complete', { tool_id: 't1', name: 'terminal', duration_s: 4 }, 5000],
        ['message.complete', { text: 'Done.', usage: { input: 1500, output: 300, reasoning: 40, calls: 3, cache_read: 1000, cost_usd: 0.012 } }, 10_000]
      ],
      { ...start, totals: { input: 1000, output: 100, reasoning: 0, calls: 1, cacheRead: 0, costUsd: 0.002 } }
    )

    expect(lastReply(state)?.stats).toEqual({
      seconds: 10,
      // 200 tokens out over the 6 seconds no tool ran.
      tokensPerSecond: 200 / 6,
      input: 500,
      output: 200,
      reasoning: 40,
      cacheRead: 1000,
      calls: 2,
      costUsd: 0.01
    })
    expect(state.totals).toMatchObject({ input: 1500, output: 300 })
    expect(state.turn).toBeNull()
  })

  it('counts from zero in a session with no replies yet', () => {
    const state = play([
      ['message.start', {}, 0],
      ['message.complete', { text: 'Hello', usage: { input: 900, output: 50, calls: 1 } }, 2000]
    ])

    expect(lastReply(state)?.stats).toMatchObject({ seconds: 2, input: 900, output: 50, calls: 1, tokensPerSecond: 25 })
  })

  it("gives only the time when the totals before the turn aren't known", () => {
    const earlier: StreamState = { ...start, items: [{ kind: 'assistant', key: 'a0', text: 'Earlier' }, asked] }
    const state = play(
      [
        ['message.start', {}, 0],
        ['message.complete', { text: 'Hello', usage: { input: 900, output: 50 } }, 3000]
      ],
      earlier
    )

    expect(lastReply(state)?.stats).toEqual({ seconds: 3 })
  })

  it('uses the totals from session.usage when message.complete has none', () => {
    const state = play(
      [
        ['message.start', {}, 0],
        ['session.usage', { usage: { input: 400, output: 80 } }, 1000],
        ['message.complete', { text: 'Hello' }, 2000]
      ],
      { ...start, totals: { input: 100, output: 20 } }
    )

    expect(lastReply(state)?.stats).toMatchObject({ input: 300, output: 60 })
  })

  it("leaves out tokens when the gateway sent no totals during the turn", () => {
    const state = play([['message.start', {}, 0], ['message.complete', { text: 'Hello' }, 2000]], { ...start, totals: { input: 100, output: 20 } })

    expect(lastReply(state)?.stats).toEqual({ seconds: 2 })
  })

  it('has no stats for a turn the phone did not see start', () => {
    const state = play([['message.complete', { text: 'Hello', usage: { input: 900, output: 50 } }, 2000]])

    expect(lastReply(state)?.stats).toBeUndefined()
  })

  it('puts the stats on the last reply of a turn with several', () => {
    const state = play([
      ['message.start', {}, 0],
      ['message.interim', { text: 'Looking.' }, 500],
      ['tool.start', { tool_id: 't1', name: 'read_file' }, 600],
      ['tool.complete', { tool_id: 't1', name: 'read_file' }, 700],
      ['message.complete', { text: 'Found it.' }, 1500]
    ])
    const replies = state.items.filter(item => item.kind === 'assistant') as AssistantItem[]

    expect(replies.map(reply => [reply.text, Boolean(reply.stats)])).toEqual([
      ['Looking.', false],
      ['Found it.', true]
    ])
  })

  it('leaves out a count that went down', () => {
    expect(turnStats({ startedAt: 0, toolSeconds: 0, before: { input: 5000, output: 100 } }, { input: 200, output: 150 }, 1000)).toEqual({
      seconds: 1,
      output: 50,
      tokensPerSecond: 50
    })
  })
})

describe('keepStats', () => {
  it("moves stats onto the gateway's rows by reply text", () => {
    const shown: ChatItem[] = [
      { kind: 'user', key: 'local-1', text: 'Hi' },
      { kind: 'assistant', key: 'reply-1', text: 'Hello', stats: { seconds: 2 } }
    ]
    const fresh: ChatItem[] = [
      { kind: 'user', key: 'row-1', text: 'Hi', rowId: 1 },
      { kind: 'assistant', key: 'row-2', text: 'Hello\n', rowId: 2 }
    ]

    expect(keepStats(shown, fresh)[1]).toEqual({ kind: 'assistant', key: 'row-2', text: 'Hello\n', rowId: 2, stats: { seconds: 2 } })
  })

  it('matches the newest reply when two have the same text', () => {
    const shown: ChatItem[] = [{ kind: 'assistant', key: 'reply-2', text: 'OK', stats: { seconds: 5 } }]
    const fresh: ChatItem[] = [
      { kind: 'assistant', key: 'row-1', text: 'OK' },
      { kind: 'assistant', key: 'row-2', text: 'OK' }
    ]
    const kept = keepStats(shown, fresh) as AssistantItem[]

    expect(kept.map(item => item.stats)).toEqual([undefined, { seconds: 5 }])
  })
})

describe('formatting', () => {
  it('formats time, tokens and cost', () => {
    expect([formatSeconds(4.23), formatSeconds(18.4), formatSeconds(245), formatSeconds(3720)]).toEqual(['4.2s', '18s', '4m 05s', '1h 02m'])
    expect([formatTokens(950), formatTokens(12_400), formatTokens(1_234_567)]).toEqual(['950', '12.4k', '1.2M'])
    expect([formatCost(0.0042), formatCost(0.008), formatCost(1.234)]).toEqual(['$0.0042', '$0.008', '$1.23'])
  })
})
