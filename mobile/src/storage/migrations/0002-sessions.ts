import type { Migration } from '../migrate'

/**
 * The saved session list: the gateway's rows, in the order it sent them.
 * Running and Needs input markers aren't saved, because they're only true
 * while connected.
 */
export const sessions: Migration = {
  version: 2,
  name: 'sessions',
  sql: `
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT,
      preview TEXT,
      started_at REAL NOT NULL,
      last_active REAL NOT NULL,
      message_count INTEGER NOT NULL,
      source TEXT,
      position INTEGER NOT NULL,
      saved_at REAL NOT NULL
    ) STRICT;

    CREATE INDEX sessions_by_position ON sessions (position);
  `
}
