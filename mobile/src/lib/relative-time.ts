import { t } from '@/i18n/t'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const startOfDay = (ms: number) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)

  return date.getTime()
}

/**
 * When a session was last active, in the desktop sidebar's short form:
 * "now", "5m", "2h", then "Yesterday", then a date such as "Oct 3"
 * (with the year when it isn't this year).
 */
export function relativeTime(unixSeconds: number, nowMs = Date.now()): string {
  const ms = unixSeconds * 1000
  const elapsed = Math.max(0, nowMs - ms)

  if (elapsed < MINUTE) {
    return t('sidebar.row.ageNow')
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}${t('sidebar.row.ageMin')}`
  }

  const today = startOfDay(nowMs)

  if (ms >= today) {
    return `${Math.floor(elapsed / HOUR)}${t('sidebar.row.ageHour')}`
  }

  // Yesterday by the calendar, not "24 to 48 hours ago".
  if (ms >= startOfDay(today - 1)) {
    return t('sidebar.dateDivider.yesterday')
  }

  const sameYear = new Date(ms).getFullYear() === new Date(nowMs).getFullYear()

  return new Date(ms).toLocaleDateString('en', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
