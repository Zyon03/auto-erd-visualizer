import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tables } from '../db/schema'
import { nextCascadePosition } from './layout'

type Db = BetterSQLite3Database<typeof schema>

export interface Table {
  id: number
  sessionId: number
  name: string
  positionX: number
  positionY: number
  autoPositioned: boolean
}

export function addTable(db: Db, sessionId: number, name: string): Table {
  const existing = db
    .select({ id: tables.id, positionX: tables.positionX, positionY: tables.positionY })
    .from(tables)
    .where(eq(tables.sessionId, sessionId))
    .all()
  const { positionX, positionY } = nextCascadePosition(existing)
  const [row] = db
    .insert(tables)
    .values({ sessionId, name, positionX, positionY, autoPositioned: true })
    .returning()
    .all()
  return row
}

export function renameTable(db: Db, tableId: number, newName: string): Table {
  const [row] = db.update(tables).set({ name: newName }).where(eq(tables.id, tableId)).returning().all()
  return row
}

/** Called only from the user's drag-stop handler — a manual drag is the one signal that a
 *  table's placement is now the user's to control, so it opts the table out of auto-layout. */
export function updateTablePosition(db: Db, tableId: number, positionX: number, positionY: number): Table {
  const [row] = db
    .update(tables)
    .set({ positionX, positionY, autoPositioned: false })
    .where(eq(tables.id, tableId))
    .returning()
    .all()
  return row
}

/** Auto-layout's own position writes — a no-op if the table has since been manually placed,
 *  applied as a single conditional update rather than a read-then-write. */
export function placeTableIfAutoPositioned(db: Db, tableId: number, positionX: number, positionY: number): Table | undefined {
  const [row] = db
    .update(tables)
    .set({ positionX, positionY })
    .where(and(eq(tables.id, tableId), eq(tables.autoPositioned, true)))
    .returning()
    .all()
  return row
}

export function getTable(db: Db, tableId: number): Table | undefined {
  return db.select().from(tables).where(eq(tables.id, tableId)).get()
}

export function deleteTable(db: Db, tableId: number): Table | undefined {
  const [row] = db.delete(tables).where(eq(tables.id, tableId)).returning().all()
  return row
}
