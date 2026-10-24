// The migrations for a gateway's database, in order.
//
// Rules for every table (see the local-storage spec):
// - Saved data is a copy of what the gateway holds. When fresh data arrives
//   from the gateway, replace the saved copy with it. The outbox is the only
//   data that exists just on the phone.
// - Each gateway has its own database, so tables don't need a gateway column.
// - A new build must keep the data an older build saved. Add a new migration
//   to change a table. Never edit or renumber one that has shipped.

import type { Migration } from '../migrate'

import { meta } from './0001-meta'
import { sessions } from './0002-sessions'
import { transcriptsAndOutbox } from './0003-transcripts-and-outbox'

export const migrations: readonly Migration[] = [meta, sessions, transcriptsAndOutbox]
