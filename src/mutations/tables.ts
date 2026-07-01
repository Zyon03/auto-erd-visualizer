import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tables } from '../db/schema'

type Db = BetterSQLite3Database<typeof schema>

export interface Table {
  id: number
  sessionId: number
  name: string
  positionX: number
  positionY: number
}

export function addTable(db: Db, sessionId: number, name: string, positionX = 0, positionY = 0): Table {
  const [row] = db.insert(tables).values({ sessionId, name, positionX, positionY }).returning().all()
  return row
}

export function renameTable(db: Db, tableId: number, newName: string): Table {
  const [row] = db.update(tables).set({ name: newName }).where(eq(tables.id, tableId)).returning().all()
  return row
}

export function updateTablePosition(db: Db, tableId: number, positionX: number, positionY: number): Table {
  const [row] = db
    .update(tables)
    .set({ positionX, positionY })
    .where(eq(tables.id, tableId))
    .returning()
    .all()
  return row
}

export function deleteTable(db: Db, tableId: number): void {
  db.delete(tables).where(eq(tables.id, tableId)).run()
}
