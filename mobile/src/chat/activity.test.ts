// How the Session screen gathers thinking and tool calls into activity blocks.

import { type ActivityItem, displayItems } from './activity'
import type { AssistantItem, ChatItem, ToolItem } from './items'

const user = (key: string): ChatItem => ({ kind: 'user', key, text: 'Hi' })
const thought = (key: string, extra: Partial<AssistantItem> = {}): AssistantItem => ({ kind: 'assistant', key, text: '', reasoning: 'Let me look', ...extra })
const tool = (key: string, running = false): ToolItem => ({ kind: 'tool', key, toolId: key, name: 'read_file', context: '/a.ts', running })
const reply = (key: string, extra: Partial<AssistantItem> = {}): AssistantItem => ({ kind: 'assistant', key, text: 'Done.', ...extra })

const kinds = (items: ReturnType<typeof displayItems>) => items.map(item => (item.kind === 'activity' ? `activity(${item.steps.length})` : item.kind))

describe('displayItems', () => {
  it('puts thinking and tool calls in a row into one block', () => {
    const shown = displayItems([user('u'), thought('a'), tool('t1'), tool('t2'), thought('b'), tool('t3'), reply('r')], false)

    expect(kinds(shown)).toEqual(['user', 'activity(5)', 'assistant'])
  })

  it('splits a reply with reasoning into a thinking step and the reply', () => {
    const shown = displayItems([user('u'), thought('a', { text: 'Here it is.' })], false)

    expect(kinds(shown)).toEqual(['user', 'activity(1)', 'assistant'])
    expect((shown[2] as AssistantItem).reasoning).toBeUndefined()
    expect((shown[2] as AssistantItem).text).toBe('Here it is.')
  })

  it('keeps the stopped mark of a reply that only had thinking', () => {
    const shown = displayItems([user('u'), thought('a', { stopped: true })], false)

    expect(kinds(shown)).toEqual(['user', 'activity(1)', 'assistant'])
    expect((shown[2] as AssistantItem).stopped).toBe(true)
  })

  it('starts a new block after a message between tool calls', () => {
    const shown = displayItems([tool('t1'), reply('r1'), tool('t2')], false)

    expect(kinds(shown)).toEqual(['activity(1)', 'assistant', 'activity(1)'])
  })

  it('marks only the last block live, and only while the turn runs', () => {
    const items = [tool('t1'), reply('r1'), tool('t2', true)]

    expect(displayItems(items, true).map(item => item.kind === 'activity' && item.live)).toEqual([false, false, true])
    expect(displayItems(items, false).some(item => item.kind === 'activity' && item.live)).toBe(false)
  })

  it('stops the block being live once the reply after it starts', () => {
    const shown = displayItems([thought('a', { text: 'Wri', streaming: true })], true)

    expect((shown[0] as ActivityItem).live).toBe(false)
  })

  it('counts thinking as in progress only until the reply text starts', () => {
    const writing = displayItems([thought('a', { streaming: true })], true)[0] as ActivityItem
    const replying = displayItems([thought('a', { streaming: true, text: 'Hi' })], true)[0] as ActivityItem

    expect(writing.steps[0]).toMatchObject({ kind: 'thinking', streaming: true })
    expect(replying.steps[0]).toMatchObject({ kind: 'thinking', streaming: false })
  })

  it('keeps a reply still being written with no reasoning as a bubble, for the typing spinner', () => {
    expect(kinds(displayItems([user('u'), { kind: 'assistant', key: 'r', text: '', streaming: true }], true))).toEqual(['user', 'assistant'])
  })

  it('hands back the same block object when its steps did not change', () => {
    const items: ChatItem[] = [tool('t1'), thought('a', { text: 'Hel', streaming: true })]
    const first = displayItems(items, true)
    const before = new Map(first.map(item => [item.key, item]))
    const next = displayItems([items[0], { ...(items[1] as AssistantItem), text: 'Hello' }], true, before)

    expect(next[0]).toBe(first[0])
    expect(next[1]).not.toBe(first[1])
  })
})
