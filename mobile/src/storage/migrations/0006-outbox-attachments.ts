import type { Migration } from '../migrate'

/** `outbox.attachments`: the photos and files sent with the message, as JSON, or null for none. */
export const outboxAttachments: Migration = {
  version: 6,
  name: 'outbox-attachments',
  sql: `
    ALTER TABLE outbox ADD COLUMN attachments TEXT;
  `
}
