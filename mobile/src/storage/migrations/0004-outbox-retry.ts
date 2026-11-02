import type { Migration } from '../migrate'

/**
 * `outbox.retry`: 1 for a message sent with Retry. When it's sent, the gateway
 * drops the failed turn it repeats, if that turn is still the session's last.
 */
export const outboxRetry: Migration = {
  version: 4,
  name: 'outbox-retry',
  sql: `
    ALTER TABLE outbox ADD COLUMN retry INTEGER NOT NULL DEFAULT 0;
  `
}
