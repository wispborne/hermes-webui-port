// A real SQLite database in memory, behind the same calls the app makes on
// expo-sqlite. Node's own SQLite runs the SQL, so the app's tables and
// queries are tested as they are.

import { DatabaseSync } from 'node:sqlite'

import type { GatewayDatabase, SqlValue } from '@/storage/database'

export type MemoryDatabase = GatewayDatabase & {
  all(sql: string, ...params: SqlValue[]): Record<string, unknown>[]
  run(sql: string): void
  closed: boolean
}

export function memoryDatabase(): MemoryDatabase {
  const db = new DatabaseSync(':memory:')
  const plain = (row: unknown) => ({ ...(row as Record<string, unknown>) })

  const wrapped: MemoryDatabase = {
    closed: false,
    execAsync: async (sql: string) => db.exec(sql),
    runAsync: async (sql: string, ...params: SqlValue[]) => {
      const result = db.prepare(sql).run(...params)

      return { changes: Number(result.changes) }
    },
    getFirstAsync: async <T,>(sql: string, ...params: SqlValue[]) => {
      const row = db.prepare(sql).get(...params)

      return row === undefined ? null : (plain(row) as T)
    },
    getAllAsync: async <T,>(sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params).map(plain) as T[],
    withExclusiveTransactionAsync: async (task: (txn: GatewayDatabase) => Promise<void>) => {
      db.exec('BEGIN EXCLUSIVE')

      try {
        await task(wrapped)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    closeAsync: async () => {
      wrapped.closed = true
    },
    all: (sql: string, ...params: SqlValue[]) => db.prepare(sql).all(...params).map(plain),
    run: (sql: string) => db.exec(sql)
  }

  return wrapped
}
