import longReply from '../../test/fixtures/long-reply.json'

import type { AssistantItem, ToolItem } from './items'
import { itemsFromRows } from './items'
import { appendReasoning, appendReply, applyEvent, type StreamState, withInflight } from './stream'

const empty: StreamState = { items: [], running: false, status: null, title: null }

type Step = [type: string, payload?: Record<string, unknown>]

/** Plays events the way the store does: deltas through the append functions, the rest through applyEvent. */
function play(steps: Step[], start = empty): StreamState {
  return steps.reduce((state, [type, payload]) => {
    if (type === 'message.delta') {
      return appendReply(state, String(payload?.text ?? ''))
    }

    if (type === 'reasoning.delta') {
      return appendReasoning(state, String(payload?.text ?? ''))
    }

    return applyEvent(state, type, payload)
  }, start)
}

const summary = (state: StreamState) =>
  state.items.map(item => {
    switch (item.kind) {
      case 'assistant':
        return { reply: item.text, ...(item.reasoning ? { reasoning: item.reasoning } : {}), ...(item.error ? { error: item.error } : {}), ...(item.streaming ? { streaming: true } : {}) }
      case 'tool':
        return { tool: item.name, running: item.running, summary: item.summary }
      case 'user':
        return { user: item.text }
      case 'note':
        return { note: item.text }
    }
  })

describe('a streamed turn', () => {
  it('builds one reply from its deltas and ends with message.complete', () => {
    const middle = play([['message.start'], ['message.delta', { text: 'Hel' }], ['message.delta', { text: 'lo' }]])

    expect(middle.running).toBe(true)
    expect(summary(middle)).toEqual([{ reply: 'Hello', streaming: true }])

    const done = play([['message.complete', { text: 'Hello there', status: 'complete' }]], middle)

    expect(done.running).toBe(false)
    expect(summary(done)).toEqual([{ reply: 'Hello there' }])
  })

  it('streams the long recorded reply in pieces to the same text', () => {
    const state = play([['message.start'], ...longReply.deltas.map((text): Step => ['message.delta', { text }])])

    expect((state.items[0] as AssistantItem).text).toBe(longReply.text)
  })

  it('keeps reasoning on the reply', () => {
    const state = play([
      ['message.start'],
      ['reasoning.delta', { text: 'Think ' }],
      ['reasoning.delta', { text: 'first.' }],
      ['message.delta', { text: 'Answer.' }],
      ['message.complete', { text: 'Answer.', status: 'complete' }]
    ])

    expect(summary(state)).toEqual([{ reply: 'Answer.', reasoning: 'Think first.' }])
  })

  it('shows tools as rows between the text written before and after them', () => {
    const state = play([
      ['message.start'],
      ['message.delta', { text: 'Let me look.' }],
      ['message.interim', { text: 'Let me look.', already_streamed: true }],
      ['tool.generating', { name: 'read_file' }],
      ['tool.start', { tool_id: 't1', name: 'read_file', args: { path: 'a.txt' }, context: 'a.txt' }],
      ['tool.progress', { tool_id: 't1', name: 'read_file', message: 'reading' }],
      ['tool.complete', { tool_id: 't1', name: 'read_file', summary: 'Read 3 lines', result_text: 'one\ntwo\nthree', inline_diff: '-a\n+b' }],
      ['message.delta', { text: 'It has three lines.' }],
      ['message.complete', { text: 'It has three lines.', status: 'complete' }]
    ])

    expect(summary(state)).toEqual([
      { reply: 'Let me look.' },
      { tool: 'read_file', running: false, summary: 'Read 3 lines' },
      { reply: 'It has three lines.' }
    ])
    expect(state.items[1]).toMatchObject({ args: { path: 'a.txt' }, context: 'a.txt', result: 'one\ntwo\nthree', diff: '-a\n+b' } satisfies Partial<ToolItem>)
  })

  it('shows one row per tool when tool.generating has no id, as a real gateway sends it', () => {
    const state = play([
      ['message.start'],
      ['tool.generating', { name: 'terminal' }],
      ['tool.generating', { name: 'clarify' }],
      ['tool.start', { tool_id: 't1', name: 'terminal', context: 'echo hello' }],
      ['tool.complete', { tool_id: 't1', name: 'terminal' }],
      ['tool.start', { tool_id: 't2', name: 'clarify' }],
      ['tool.complete', { tool_id: 't2', name: 'clarify' }]
    ])

    expect(summary(state)).toEqual([
      { tool: 'terminal', running: false, summary: undefined },
      { tool: 'clarify', running: false, summary: undefined }
    ])
  })

  it('marks a tool as running until it completes', () => {
    const state = play([['message.start'], ['tool.start', { tool_id: 't1', name: 'terminal' }]])

    expect(summary(state)).toEqual([{ tool: 'terminal', running: true, summary: undefined }])
  })

  it('keeps the error of a failed turn', () => {
    const state = play([
      ['message.start'],
      ['message.delta', { text: 'Let me try…' }],
      ['message.complete', { text: 'Let me try…', status: 'error', error: 'The provider answered 500.' }]
    ])

    expect(summary(state)).toEqual([{ reply: 'Let me try…', error: 'The provider answered 500.' }])
    expect(state.running).toBe(false)
  })

  it('keeps the reply so far when the turn is stopped, and marks open tools done', () => {
    const state = play([
      ['message.start'],
      ['message.delta', { text: 'Half a rep' }],
      ['tool.start', { tool_id: 't1', name: 'terminal' }],
      ['message.complete', { text: '', status: 'interrupted' }]
    ])

    expect(summary(state)).toEqual([{ reply: 'Half a rep' }, { tool: 'terminal', running: false, summary: undefined }])
  })

  it('splits reply blocks at a null delta', () => {
    const state = play([
      ['message.start'],
      ['message.delta', { text: 'First.' }],
      ['message.interim', { text: '' }],
      ['message.delta', { text: 'Second.' }]
    ])

    expect(summary(state)).toEqual([{ reply: 'First.' }, { reply: 'Second.', streaming: true }])
  })

  it('takes the title, status lines and session errors', () => {
    const state = play([
      ['session.title', { title: 'Docker cache' }],
      ['status.update', { kind: 'compacting', text: 'Compacting…' }],
      ['error', { message: 'The session failed.' }]
    ])

    expect(state.title).toBe('Docker cache')
    expect(state.status).toBe('Compacting…')
    expect(summary(state)).toEqual([{ note: 'The session failed.' }])
  })

  it('clears the queued mark on the message the next turn answers', () => {
    const start: StreamState = { ...empty, items: [{ kind: 'user', key: 'u1', text: 'And then?', state: 'queued' }] }

    expect(play([['message.start']], start).items[0]).toMatchObject({ state: undefined })
  })

  it('rebuilds the reply in progress after opening a running session', () => {
    const start: StreamState = { ...empty, items: itemsFromRows([{ role: 'user', content: 'Earlier', row_id: 1 }]) }
    const state = withInflight(start, { user: 'Plan the beds', assistant: 'You need six' })

    expect(state.running).toBe(true)
    expect(summary(state)).toEqual([{ user: 'Earlier' }, { user: 'Plan the beds' }, { reply: 'You need six', streaming: true }])
  })
})

describe('itemsFromRows', () => {
  it('turns gateway rows into bubbles and tool rows, and leaves out system and hidden rows', () => {
    const items = itemsFromRows([
      { role: 'system', content: 'You are Hermes.' },
      { role: 'user', content: 'Hi', row_id: 1 },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello' }], reasoning: 'Greet back.', id: 2 },
      { role: 'tool', tool_name: 'read_file', content: 'file text', args: { path: 'a' }, context: 'a', tool_call_id: 'c1', row_id: 3 },
      { role: 'user', content: 'hidden', display_kind: 'hidden', row_id: 4 }
    ])

    expect(items).toEqual([
      { kind: 'user', key: 'row-1', text: 'Hi', rowId: 1 },
      { kind: 'assistant', key: 'row-2', text: 'Hello', reasoning: 'Greet back.', rowId: 2 },
      { kind: 'tool', key: 'row-3', toolId: 'c1', name: 'read_file', context: 'a', args: { path: 'a' }, result: 'file text', running: false, rowId: 3 }
    ])
  })

  it("takes a saved tool row's arguments from the assistant row's tool_calls", () => {
    const items = itemsFromRows([
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'terminal', arguments: '{"command":"echo hello"}' } }],
        row_id: 1
      },
      { role: 'tool', tool_name: 'terminal', content: 'hello', tool_call_id: 'c1', row_id: 2 }
    ])

    expect(items).toEqual([
      { kind: 'tool', key: 'row-2', toolId: 'c1', name: 'terminal', context: 'echo hello', args: { command: 'echo hello' }, result: 'hello', running: false, rowId: 2 }
    ])
  })
})
