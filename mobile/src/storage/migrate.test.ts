import { DatabaseSync } from 'node:sqlite'

import { type Migration, migrate, type SqlDatabase } from './migrate'
import { migrations } from './migrations'

/** A real SQLite database in memory, behind the same calls the app makes on expo-sqlite. */
function memoryDatabase(): SqlDatabase & { all(sql: string): unknown[]; run(sql: string): void } {
  const db = new DatabaseSync(':memory:')
  const wrapped = {
    execAsync: async (sql: string) => db.exec(sql),
    getFirstAsync: async <T,>(sql: string) => (db.prepare(sql).get() as T | undefined) ?? null,
    withExclusiveTransactionAsync: async (task: (txn: SqlDatabase) => Promise<void>) => {
      db.exec('BEGIN EXCLUSIVE')

      try {
        await task(wrapped)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    all: (sql: string) => db.prepare(sql).all().map(row => ({ ...row })),
    run: (sql: string) => db.exec(sql)
  }

  return wrapped
}

const testMigrations: Migration[] = [
  { version: 1, name: 'one', sql: 'CREATE TABLE log (step TEXT NOT NULL);' },
  { version: 2, name: 'two', sql: "INSERT INTO log VALUES ('two');" },
  { version: 3, name: 'three', sql: "INSERT INTO log VALUES ('three');" }
]

const userVersion = async (db: SqlDatabase) =>
  (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version

describe('migrate', () => {
  it('runs migrations in order', async () => {
    const db = memoryDatabase()

    await expect(migrate(db, testMigrations)).resolves.toBe(3)
    expect(db.all('SELECT step FROM log')).toEqual([{ step: 'two' }, { step: 'three' }])
    expect(await userVersion(db)).toBe(3)
  })

  it('changes nothing on a second run', async () => {
    const db = memoryDatabase()
    await migrate(db, testMigrations)

    await expect(migrate(db, testMigrations)).resolves.toBe(0)
    expect(db.all('SELECT step FROM log')).toEqual([{ step: 'two' }, { step: 'three' }])
    expect(await userVersion(db)).toBe(3)
  })

  it('runs only the new migrations after an update, and keeps the saved data', async () => {
    const db = memoryDatabase()
    await migrate(db, testMigrations.slice(0, 2))
    db.run("INSERT INTO log VALUES ('saved by the old build')")

    await expect(migrate(db, testMigrations)).resolves.toBe(1)
    expect(db.all('SELECT step FROM log')).toEqual([
      { step: 'two' },
      { step: 'saved by the old build' },
      { step: 'three' }
    ])
  })

  it('leaves the database as it was when a migration fails', async () => {
    const db = memoryDatabase()
    const broken = [
      ...testMigrations.slice(0, 2),
      { version: 3, name: 'broken', sql: "INSERT INTO log VALUES ('three'); NOT SQL;" }
    ]

    await expect(migrate(db, broken)).rejects.toThrow()
    expect(db.all('SELECT step FROM log')).toEqual([{ step: 'two' }])
    expect(await userVersion(db)).toBe(2)
  })

  it('refuses data saved by a newer build', async () => {
    const db = memoryDatabase()
    await migrate(db, testMigrations)

    await expect(migrate(db, testMigrations.slice(0, 1))).rejects.toThrow('only knows up to 1')
  })

  it('refuses migrations that are numbered out of order', async () => {
    await expect(migrate(memoryDatabase(), [testMigrations[1]])).rejects.toThrow('expected 1')
  })

  it('runs the app migrations once', async () => {
    const db = memoryDatabase()

    await expect(migrate(db, migrations)).resolves.toBe(migrations.length)
    await expect(migrate(db, migrations)).resolves.toBe(0)
  })
})
