import type { DisplayItem } from './activity'
import { turnEnds } from './turns'

const user = (key: string, text = 'Hi'): DisplayItem => ({ kind: 'user', key, text })
const reply = (key: string, text: string, extra = {}): DisplayItem => ({ kind: 'assistant', key, text, ...extra })
const block: DisplayItem = { kind: 'activity', key: 'a1', steps: [], live: false }

describe('turnEnds', () => {
  it("marks each turn's last reply with the turn's reply text, tool rows left out", () => {
    const ends = turnEnds([user('u1'), reply('r1', 'Here is what I found.'), block, reply('r2', 'Run it once a day.'), user('u2'), reply('r3', 'Done.')], false)

    expect([...ends]).toEqual([
      ['r2', 'Here is what I found.\n\nRun it once a day.'],
      ['r3', 'Done.']
    ])
  })

  it('leaves out the turn that is still running', () => {
    expect([...turnEnds([user('u1'), reply('r1', 'Done.'), user('u2'), reply('r2', 'Half')], true).keys()]).toEqual(['r1'])
  })

  it('marks a failed reply with no text, so it can still be retried', () => {
    expect([...turnEnds([user('u1'), reply('r1', '', { error: 'The provider answered 500.' })], false)]).toEqual([['r1', '']])
  })

  it('marks nothing for a turn with no reply', () => {
    expect(turnEnds([user('u1'), block], false).size).toBe(0)
  })
})
