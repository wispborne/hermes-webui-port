import type { Attachment } from '@/chat/attachments'

import type { GatewayDatabase } from './database'

/**
 * A message written on the phone that the gateway hasn't accepted yet.
 *
 * - `waiting`: not sent yet
 * - `sending`: `prompt.submit` was sent and its answer hasn't arrived
 * - `uncertain`: the connection dropped while sending, so the gateway may or
 *   may not have it. Checked against the transcript before sending again.
 */
export interface OutboxEntry {
  id: string
  /** The stored session id, or a local id (`local-…`) for a session not created on the gateway yet. */
  sessionKey: string
  text: string
  /** Unix seconds. */
  createdAt: number
  state: 'waiting' | 'sending' | 'uncertain'
  /** Sent with Retry: the gateway drops the turn it repeats first, if it can. */
  retry?: boolean
  /** Photos and files uploaded just before the message. */
  attachments?: Attachment[]
}

interface SavedEntry {
  id: string
  session_key: string
  text: string
  created_at: number
  state: OutboxEntry['state']
  retry: number
  attachments: string | null
}

const fromSaved = (row: SavedEntry): OutboxEntry => ({
  id: row.id,
  sessionKey: row.session_key,
  text: row.text,
  createdAt: row.created_at,
  state: row.state,
  ...(row.retry ? { retry: true } : {}),
  ...(row.attachments ? { attachments: JSON.parse(row.attachments) as Attachment[] } : {})
})

export async function addToOutbox(db: GatewayDatabase, entry: OutboxEntry) {
  await db.runAsync(
    'INSERT INTO outbox (id, session_key, text, created_at, state, retry, attachments) VALUES (?, ?, ?, ?, ?, ?, ?)',
    entry.id,
    entry.sessionKey,
    entry.text,
    entry.createdAt,
    entry.state,
    entry.retry ? 1 : 0,
    entry.attachments?.length ? JSON.stringify(entry.attachments) : null
  )
}

/** Every entry, oldest first: the order they're sent in. */
export async function loadOutbox(db: GatewayDatabase): Promise<OutboxEntry[]> {
  return (await db.getAllAsync<SavedEntry>('SELECT * FROM outbox ORDER BY created_at, rowid')).map(fromSaved)
}

export async function setOutboxState(db: GatewayDatabase, id: string, state: OutboxEntry['state']) {
  await db.runAsync('UPDATE outbox SET state = ? WHERE id = ?', state, id)
}

export async function removeFromOutbox(db: GatewayDatabase, id: string) {
  await db.runAsync('DELETE FROM outbox WHERE id = ?', id)
}

/** After a session made on the phone is created on the gateway, its entries move to the stored id. */
export async function moveOutboxSession(db: GatewayDatabase, fromKey: string, toKey: string) {
  await db.runAsync('UPDATE outbox SET session_key = ? WHERE session_key = ?', toKey, fromKey)
}

/**
 * Entries left as `sending` were in flight when the app closed. Their answer
 * will never arrive, so they're treated as uncertain.
 */
export async function markInterruptedSends(db: GatewayDatabase) {
  await db.runAsync("UPDATE outbox SET state = 'uncertain' WHERE state = 'sending'")
}

/** Drops the messages waiting for a session that was deleted. */
export async function removeSessionFromOutbox(db: GatewayDatabase, sessionKey: string) {
  await db.runAsync('DELETE FROM outbox WHERE session_key = ?', sessionKey)
}
