import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite'

import { migrate } from './migrate'
import { migrations } from './migrations'

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

/**
 * Opens the database for one gateway and brings it up to date. Each gateway has
 * its own file in the app's private storage, so one gateway's data is never
 * shown for another.
 */
export async function openGatewayDatabase(gatewayUrl: string): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(gatewayDatabaseName(gatewayUrl))

  await db.execAsync('PRAGMA journal_mode = WAL')
  await migrate(db, migrations)
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'gateway', gatewayKey(gatewayUrl))

  return db
}
