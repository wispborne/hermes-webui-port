import type { SessionRow } from '@/gateway/sessions-api'

import type { GatewayDatabase } from './database'

interface SavedRow {
  id: string
  title: string | null
  preview: string | null
  started_at: number
  last_active: number
  message_count: number
  source: string | null
}

const fromSaved = (row: SavedRow): SessionRow => ({
  id: row.id,
  title: row.title,
  preview: row.preview,
  startedAt: row.started_at,
  lastActive: row.last_active,
  messageCount: row.message_count,
  source: row.source
})

async function writeRows(db: GatewayDatabase, rows: SessionRow[], firstPosition: number) {
  const savedAt = Date.now() / 1000

  for (const [index, row] of rows.entries()) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sessions (id, title, preview, started_at, last_active, message_count, source, position, saved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id,
      row.title,
      row.preview,
      row.startedAt,
      row.lastActive,
      row.messageCount,
      row.source,
      firstPosition + index,
      savedAt
    )
  }
}

/**
 * Saves the gateway's first page as the whole saved list. Rows the gateway no
 * longer returns there are deleted, so sessions deleted elsewhere disappear.
 */
export async function saveFirstPage(db: GatewayDatabase, rows: SessionRow[]) {
  await db.withExclusiveTransactionAsync(async txn => {
    await txn.execAsync('DELETE FROM sessions')
    await writeRows(txn, rows, 0)
  })
}

/** Saves a later page below the rows already saved. */
export async function saveNextPage(db: GatewayDatabase, rows: SessionRow[], firstPosition: number) {
  await db.withExclusiveTransactionAsync(async txn => {
    await writeRows(txn, rows, firstPosition)
  })
}

export async function loadSavedRows(db: GatewayDatabase): Promise<SessionRow[]> {
  return (await db.getAllAsync<SavedRow>('SELECT * FROM sessions ORDER BY position')).map(fromSaved)
}

/** Saved sessions whose title or preview contains `query`, ignoring case. */
export async function searchSavedRows(db: GatewayDatabase, query: string): Promise<SessionRow[]> {
  const pattern = `%${query.trim().replace(/[\\%_]/g, char => `\\${char}`)}%`
  const rows = await db.getAllAsync<SavedRow>(
    `SELECT * FROM sessions
     WHERE title LIKE ? ESCAPE '\\' OR preview LIKE ? ESCAPE '\\'
     ORDER BY position`,
    pattern,
    pattern
  )

  return rows.map(fromSaved)
}
