import type { SessionRow } from '@/gateway/sessions-api'
import { t } from '@/i18n/t'

/** What a session's row shows. */
export interface SessionText {
  heading: string
  /** The line under the heading, or null when there's nothing new to say. */
  preview: string | null
  /** A scheduled job's delivery, or a session the cron source made. */
  scheduled: boolean
}

/** The line a scheduled job's delivery starts with: `[Cron delivery: <job name>]`. */
const DELIVERY = /^\[Cron delivery:\s*([^\]]+)\]\s*/i

const HEADING_LENGTH = 80

/**
 * One line of a message as plain text: the first non-empty line, without
 * Markdown's bold, code and heading or list marks. Single `*` and `_` stay,
 * so words like `cache_dir` keep their underscore.
 */
function plainLine(text: string): string {
  const line = text.split('\n').find(found => found.trim()) ?? ''

  return line
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*)/, '')
    .replace(/\*\*|__|`/g, '')
    .trim()
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function describeSession(row: SessionRow): SessionText {
  const delivered = row.title ?? row.preview ?? ''
  const delivery = DELIVERY.exec(delivered)

  if (delivery) {
    const message = plainLine(delivered.slice(delivery[0].length))

    return { heading: delivery[1].trim(), preview: message || null, scheduled: true }
  }

  const scheduled = row.source === 'cron'

  if (row.title) {
    const preview = row.preview ? plainLine(row.preview) : ''

    return { heading: row.title, preview: preview && !same(preview, row.title) ? preview : null, scheduled }
  }

  const heading = row.preview ? plainLine(row.preview).slice(0, HEADING_LENGTH) : ''

  return { heading: heading || t('sidebar.row.untitledPlaceholder'), preview: null, scheduled }
}
