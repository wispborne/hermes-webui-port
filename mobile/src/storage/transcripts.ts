import type { ChatItem } from '@/chat/items'

import type { GatewayDatabase } from './database'

/** Transcripts are kept for this many of the most recently opened sessions. */
export const SAVED_TRANSCRIPT_LIMIT = 50

export interface SavedTranscript {
  items: ChatItem[]
  hasEarlier: boolean
  /** How many gateway rows the saved items came from, for paging older rows. */
  gatewayRows: number
}

/** The saved transcript, or null when this session was never opened on the phone (or was dropped). */
export async function loadTranscript(db: GatewayDatabase, sessionId: string): Promise<SavedTranscript | null> {
  const opened = await db.getFirstAsync<{ has_earlier: number; gateway_rows: number; saved_at: number | null }>(
    'SELECT has_earlier, gateway_rows, saved_at FROM opened_sessions WHERE session_id = ?',
    sessionId
  )

  if (!opened || opened.saved_at === null) {
    return null
  }

  const rows = await db.getAllAsync<{ item: string }>(
    'SELECT item FROM messages WHERE session_id = ? ORDER BY position',
    sessionId
  )

  return {
    items: rows.map(row => JSON.parse(row.item) as ChatItem),
    hasEarlier: opened.has_earlier === 1,
    gatewayRows: opened.gateway_rows
  }
}

/** Replaces the saved transcript of one session. Items still streaming are saved as they are now. */
export async function saveTranscript(db: GatewayDatabase, sessionId: string, transcript: SavedTranscript) {
  // Outbox messages are saved in the outbox, not here.
  const items = transcript.items.filter(item => !(item.kind === 'user' && item.outboxId))

  await db.withExclusiveTransactionAsync(async txn => {
    await txn.runAsync('DELETE FROM messages WHERE session_id = ?', sessionId)

    for (const [position, item] of items.entries()) {
      const rowId = 'rowId' in item && typeof item.rowId === 'number' ? item.rowId : null
      await txn.runAsync(
        'INSERT INTO messages (session_id, position, row_id, item) VALUES (?, ?, ?, ?)',
        sessionId,
        position,
        rowId,
        JSON.stringify({ ...item, ...(item.kind === 'assistant' ? { streaming: false } : {}) })
      )
    }

    await txn.runAsync(
      `INSERT INTO opened_sessions (session_id, opened_at, has_earlier, gateway_rows, saved_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (session_id) DO UPDATE SET
         has_earlier = excluded.has_earlier, gateway_rows = excluded.gateway_rows, saved_at = excluded.saved_at`,
      sessionId,
      Date.now() / 1000,
      transcript.hasEarlier ? 1 : 0,
      transcript.gatewayRows,
      Date.now() / 1000
    )
  })
}

/**
 * Records that a session was opened now, and deletes the transcripts of all
 * but the 50 most recently opened sessions. Returns the ids it dropped.
 */
export async function markOpened(db: GatewayDatabase, sessionId: string, now = Date.now() / 1000): Promise<string[]> {
  let dropped: string[] = []

  await db.withExclusiveTransactionAsync(async txn => {
    await txn.runAsync(
      `INSERT INTO opened_sessions (session_id, opened_at) VALUES (?, ?)
       ON CONFLICT (session_id) DO UPDATE SET opened_at = excluded.opened_at`,
      sessionId,
      now
    )

    const old = await txn.getAllAsync<{ session_id: string }>(
      'SELECT session_id FROM opened_sessions ORDER BY opened_at DESC LIMIT -1 OFFSET ?',
      SAVED_TRANSCRIPT_LIMIT
    )
    dropped = old.map(row => row.session_id)

    for (const id of dropped) {
      await txn.runAsync('DELETE FROM messages WHERE session_id = ?', id)
      await txn.runAsync('DELETE FROM opened_sessions WHERE session_id = ?', id)
    }
  })

  return dropped
}
