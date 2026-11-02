import type { Migration } from '../migrate'

/** `sessions.pinned`: 1 for a session pinned on the gateway. */
export const sessionsPinned: Migration = {
  version: 5,
  name: 'sessions-pinned',
  sql: `
    ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
  `
}
