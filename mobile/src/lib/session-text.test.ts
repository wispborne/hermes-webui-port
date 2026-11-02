import type { SessionRow } from '@/gateway/sessions-api'

import { describeSession } from './session-text'

const row = (title: string | null, preview: string | null, source = 'gui'): SessionRow => ({
  id: 's1',
  title,
  preview,
  startedAt: 0,
  lastActive: 0,
  messageCount: 1,
  source,
  pinned: false
})

describe('describeSession', () => {
  it('shows a titled session as its title, with the first line of its preview', () => {
    expect(describeSession(row('Fix the Docker build cache', 'The build re-downloads\nevery layer.'))).toEqual({
      heading: 'Fix the Docker build cache',
      preview: 'The build re-downloads',
      scheduled: false
    })
  })

  it('heads an untitled session with the start of its first message', () => {
    expect(describeSession(row(null, 'How many drip lines do I need?'))).toEqual({
      heading: 'How many drip lines do I need?',
      preview: null,
      scheduled: false
    })
  })

  it('heads a scheduled job delivery with the job name, and previews the message without Markdown marks', () => {
    expect(describeSession(row(null, '[Cron delivery: USC daily digest] **USC digest — Friday**\n- 3 new issues'))).toEqual({
      heading: 'USC daily digest',
      preview: 'USC digest — Friday',
      scheduled: true
    })
  })

  it('reads the job name from a title that holds the delivery line too', () => {
    expect(describeSession(row('[Cron delivery: morning-briefing] ## Morning Brief', null))).toEqual({
      heading: 'morning-briefing',
      preview: 'Morning Brief',
      scheduled: true
    })
  })

  it('counts a session from the cron source as scheduled', () => {
    expect(describeSession(row('Nightly backup check', null, 'cron')).scheduled).toBe(true)
  })

  it('leaves out a preview that only repeats the heading', () => {
    expect(describeSession(row('Plan the beds', 'Plan the beds')).preview).toBeNull()
  })

  it('keeps underscores in words, such as cache_dir', () => {
    expect(describeSession(row('Settings', 'Set `cache_dir` and **max_size**')).preview).toBe('Set cache_dir and max_size')
  })

  it('names a session with nothing to show as untitled', () => {
    expect(describeSession(row(null, null)).heading).toBe('Untitled session')
  })
})
