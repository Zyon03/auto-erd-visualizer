import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export function createDb(dbPath: string): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(dbPath)
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  return db
}

export const db = createDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), 'auto-erd.db'))
