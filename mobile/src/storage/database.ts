import { deleteDatabaseAsync, openDatabaseAsync } from 'expo-sqlite'

import { type SqlDatabase, migrate } from './migrate'
import { migrations } from './migrations'

export type SqlValue = string | number | null

/**
 * The part of an expo-sqlite database the app uses. Tests pass a Node SQLite
 * database behind the same calls (`test/memory-database.ts`).
 */
export interface GatewayDatabase extends SqlDatabase {
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>
  closeAsync(): Promise<void>
  /** Runs `task` in one transaction. Inside it, make every call on `txn`, not on the database. */
  withExclusiveTransactionAsync(task: (txn: GatewayDatabase) => Promise<void>): Promise<void>
}

/**
 * The gateway's address in a fixed form, so the same gateway always gets the
 * same database: lower-case host, no default port, no trailing slash. The
 * scheme is left out, because http and https on one host are the same gateway.
 */
export function gatewayKey(gatewayUrl: string): string {
  const url = new URL(gatewayUrl)
  const path = url.pathname.replace(/\/+$/, '')

  return `${url.host.toLowerCase()}${path}`
}

/** The database file name for a gateway, such as `gateway-hermes.example.com.db`. */
export function gatewayDatabaseName(gatewayUrl: string): string {
  return `gateway-${gatewayKey(gatewayUrl).replace(/[^a-z0-9.-]/gi, '_')}.db`
}

/** Brings a gateway's database up to date and records which gateway it belongs to. */
export async function prepareGatewayDatabase(db: GatewayDatabase, gatewayUrl: string): Promise<GatewayDatabase> {
  await migrate(db, migrations)
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'gateway', gatewayKey(gatewayUrl))

  return db
}

/**
 * Opens the database for one gateway and brings it up to date. Each gateway has
 * its own file in the app's private storage, so one gateway's data is never
 * shown for another.
 */
export async function openGatewayDatabase(gatewayUrl: string): Promise<GatewayDatabase> {
  const db = await openDatabaseAsync(gatewayDatabaseName(gatewayUrl))

  await db.execAsync('PRAGMA journal_mode = WAL')

  return prepareGatewayDatabase(db as unknown as GatewayDatabase, gatewayUrl)
}

/** Deletes everything saved for a gateway, outbox included. Close the database first. */
export async function deleteGatewayDatabase(gatewayUrl: string): Promise<void> {
  try {
    await deleteDatabaseAsync(gatewayDatabaseName(gatewayUrl))
  } catch (error) {
    // Nothing to delete when the database was never created.
    if (!/not found|does not exist|no such file/i.test(String(error))) {
      throw error
    }
  }
}
