import { eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { sessions, tables } from '../db/schema'

type Db = BetterSQLite3Database<typeof schema>

export interface Session {
  id: number
  name: string
  claudeSessionId: string | null
  model: string | null
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

export function renameSession(db: Db, id: number, name: string): Session {
  const [row] = db.update(sessions).set({ name }).where(eq(sessions.id, id)).returning().all()
  return row
}

export function deleteSession(db: Db, id: number): Session | undefined {
  const [row] = db.delete(sessions).where(eq(sessions.id, id)).returning().all()
  return row
}

export function listSessions(db: Db): SessionSummary[] {
  // Not a correlated subquery on purpose: `tables` also has its own `id` column, and the
  // scalar-subquery form (`select count(*) from tables where session_id = sessions.id`) let
  // drizzle's raw-sql interpolation emit an unqualified "id" for sessions.id — inside the
  // subquery's own scope that resolves to tables.id instead, silently counting only the
  // coincidental rows where a table's id happened to equal its session's id. A real LEFT JOIN
  // qualifies every column through the query builder, so there's no ambiguity to resolve wrong.
  return db
    .select({
      id: sessions.id,
      name: sessions.name,
      claudeSessionId: sessions.claudeSessionId,
      model: sessions.model,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      tableCount: sql<number>`count(${tables.id})`,
    })
    .from(sessions)
    .leftJoin(tables, eq(tables.sessionId, sessions.id))
    .groupBy(sessions.id)
    .all()
}

export function getSession(db: Db, id: number): Session | undefined {
  return db.select().from(sessions).where(eq(sessions.id, id)).get()
}

export function setClaudeSessionId(db: Db, sessionId: number, claudeSessionId: string): Session {
  const [row] = db.update(sessions).set({ claudeSessionId }).where(eq(sessions.id, sessionId)).returning().all()
  return row
}

export function clearClaudeSessionId(db: Db, sessionId: number): Session {
  const [row] = db.update(sessions).set({ claudeSessionId: null }).where(eq(sessions.id, sessionId)).returning().all()
  return row
}

export function setSessionModel(db: Db, sessionId: number, model: string | null): Session {
  const [row] = db.update(sessions).set({ model }).where(eq(sessions.id, sessionId)).returning().all()
  return row
}
