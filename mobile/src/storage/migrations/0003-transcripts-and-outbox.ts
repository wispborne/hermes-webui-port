import type { Migration } from '../migrate'

/**
 * Saved transcripts and the outbox.
 *
 * - `messages`: the transcript rows of a session, in display order. `item`
 *   is the row as the Session screen draws it (JSON). `row_id` is the
 *   gateway's row id, when the row came from the gateway.
 * - `opened_sessions`: when each session was last opened on this phone,
 *   whether it has older rows than the saved ones, and when its transcript
 *   was last saved (null when it never was). Only the 50 most recently
 *   opened sessions keep a transcript.
 * - `outbox`: messages written while the gateway couldn't be reached. The
 *   only data that exists just on the phone. `session_key` is the stored id,
 *   or a local id for a session not created on the gateway yet.
 */
export const transcriptsAndOutbox: Migration = {
  version: 3,
  name: 'transcripts-and-outbox',
  sql: `
    CREATE TABLE messages (
      session_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      row_id INTEGER,
      item TEXT NOT NULL,
      PRIMARY KEY (session_id, position)
    ) STRICT;

    CREATE TABLE opened_sessions (
      session_id TEXT PRIMARY KEY NOT NULL,
      opened_at REAL NOT NULL,
      has_earlier INTEGER NOT NULL DEFAULT 0,
      gateway_rows INTEGER NOT NULL DEFAULT 0,
      saved_at REAL
    ) STRICT;

    CREATE TABLE outbox (
      id TEXT PRIMARY KEY NOT NULL,
      session_key TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at REAL NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('waiting', 'sending', 'uncertain'))
    ) STRICT;

    CREATE INDEX outbox_by_time ON outbox (created_at);
  `
}
