import { relativeTime } from './relative-time'

const at = (text: string) => new Date(text).getTime()
const seconds = (text: string) => at(text) / 1000
const now = at('2026-10-24T15:00:00')

describe('relativeTime', () => {
  it('uses the desktop sidebar short forms', () => {
    expect(relativeTime(seconds('2026-10-24T14:59:30'), now)).toBe('now')
    expect(relativeTime(seconds('2026-10-24T14:55:00'), now)).toBe('5m')
    expect(relativeTime(seconds('2026-10-24T09:10:00'), now)).toBe('5h')
  })

  it('says Yesterday for the day before, by the calendar', () => {
    expect(relativeTime(seconds('2026-10-23T23:30:00'), now)).toBe('Yesterday')
    expect(relativeTime(seconds('2026-10-23T00:10:00'), now)).toBe('Yesterday')
  })

  it('gives a date for anything older, with the year only when it differs', () => {
    expect(relativeTime(seconds('2026-10-03T12:00:00'), now)).toBe('Oct 3')
    expect(relativeTime(seconds('2025-12-30T12:00:00'), now)).toBe('Dec 30, 2025')
  })
})
