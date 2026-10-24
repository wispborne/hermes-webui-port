/** The part of an expo-sqlite database the migration runner uses. */
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>
  getFirstAsync<T>(sql: string): Promise<T | null>
  withExclusiveTransactionAsync(task: (txn: SqlDatabase) => Promise<void>): Promise<void>
}

export interface Migration {
  /** 1 for the first migration, then one more for each. Never renumber or edit a migration once it has shipped. */
  version: number
  name: string
  sql: string
}

/**
 * Brings a database up to the newest migration. Each migration and its version
 * number are written in one transaction, so a migration either runs fully or
 * not at all. The database's `user_version` holds the last version applied.
 *
 * Returns how many migrations ran.
 */
export async function migrate(db: SqlDatabase, migrations: readonly Migration[]): Promise<number> {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration "${migration.name}" has version ${migration.version}, expected ${index + 1}.`)
    }
  })

  const current = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0
  const latest = migrations.length

  if (current > latest) {
    // An older build was installed over a newer one. Leave the data alone.
    throw new Error(`The saved data is at version ${current}, but this build only knows up to ${latest}.`)
  }

  for (const migration of migrations.slice(current)) {
    await db.withExclusiveTransactionAsync(async txn => {
      await txn.execAsync(migration.sql)
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`)
    })
  }

  return latest - current
}
