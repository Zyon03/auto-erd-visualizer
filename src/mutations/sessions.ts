import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { sessions, tables } from '../db/schema'

type Db = BetterSQLite3Database<typeof schema>

export interface Session {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

export interface SessionSummary extends Session {
  tableCount: number
}

export function createSession(db: Db, name: string): Session {
  const [row] = db.insert(sessions).values({ name }).returning().all()
  return row
}

export function listSessions(db: Db): SessionSummary[] {
  return db
    .select({
      id: sessions.id,
      name: sessions.name,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      tableCount: sql<number>`(select count(*) from ${tables} where ${tables.sessionId} = ${sessions.id})`,
    })
    .from(sessions)
    .all()
}

export function getSession(db: Db, id: number): Session | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get()
}
