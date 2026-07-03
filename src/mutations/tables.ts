import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tables } from '../db/schema'
import { nextCascadePosition } from './layout'
import type { TableRole } from './tableRole'

type Db = BetterSQLite3Database<typeof schema>

export interface Table {
  id: number
  sessionId: number
  name: string
  positionX: number
  positionY: number
  autoPositioned: boolean
  createdAt: string
  roleOverride: TableRole | null
}

/** `role` lets a caller that already knows the answer (the AI, at creation time — see the system
 *  prompt in agent/runTurn.ts) set it up front instead of leaving it to the FK-presence heuristic
 *  in mutations/tableRole.ts, which is a reasonable fallback but not a reliable judge of "master
 *  vs transactional": a table can hold a foreign key and still be reference data (e.g. an
 *  Employee table referencing Department). Manual table creation omits it and gets the heuristic,
 *  same as before. */
export function addTable(db: Db, sessionId: number, name: string, role: TableRole | null = null): Table {
  const existing = db
    .select({ id: tables.id, positionX: tables.positionX, positionY: tables.positionY })
    .from(tables)
    .where(eq(tables.sessionId, sessionId))
    .all()
  const { positionX, positionY } = nextCascadePosition(existing)
  const [row] = db
    .insert(tables)
    .values({ sessionId, name, positionX, positionY, autoPositioned: true, roleOverride: role })
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

/** The explicit "auto organize" action, unlike placeTableIfAutoPositioned, overwrites every
 *  table unconditionally — including ones a manual drag had previously opted out of auto-layout.
 *  Re-running a whole-diagram organize is itself a deliberate override of any earlier manual
 *  placement, so it also re-enrolls the table in future incremental auto-layout nudges. */
export function setAutoLayoutPosition(db: Db, tableId: number, positionX: number, positionY: number): Table {
  const [row] = db
    .update(tables)
    .set({ positionX, positionY, autoPositioned: true })
    .where(eq(tables.id, tableId))
    .returning()
    .all()
  return row
}

/** Lets a user pin a table's master/transactional tag when the FK-based heuristic
 *  (mutations/tableRole.ts) gets it wrong — null clears the pin and reverts to auto-detection. */
export function setTableRole(db: Db, tableId: number, role: TableRole | null): Table {
  const [row] = db.update(tables).set({ roleOverride: role }).where(eq(tables.id, tableId)).returning().all()
  return row
}

export function getTable(db: Db, tableId: number): Table | undefined {
  return db.select().from(tables).where(eq(tables.id, tableId)).get()
}

export function deleteTable(db: Db, tableId: number): Table | undefined {
  const [row] = db.delete(tables).where(eq(tables.id, tableId)).returning().all()
  return row
}
