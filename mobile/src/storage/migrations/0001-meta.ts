import type { Migration } from '../migrate'

/** Facts about the database itself, such as which gateway it belongs to. */
export const meta: Migration = {
  version: 1,
  name: 'meta',
  sql: `
    CREATE TABLE meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) STRICT;
  `
}
