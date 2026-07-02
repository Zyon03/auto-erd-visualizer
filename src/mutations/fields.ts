import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { fields } from '../db/schema'

type Db = BetterSQLite3Database<typeof schema>

export interface Field {
  id: number
  tableId: number
  name: string
  type: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  order: number
}

export function addField(
  db: Db,
  tableId: number,
  name: string,
  type: string,
  isPrimaryKey = false,
  isForeignKey = false,
): Field {
  const existing = db.select().from(fields).where(eq(fields.tableId, tableId)).all()
  const [row] = db
    .insert(fields)
    .values({ tableId, name, type, isPrimaryKey, isForeignKey, order: existing.length })
    .returning()
    .all()
  return row
}

export function renameField(db: Db, fieldId: number, newName: string): Field {
  const [row] = db.update(fields).set({ name: newName }).where(eq(fields.id, fieldId)).returning().all()
  return row
}

export function updateField(
  db: Db,
  fieldId: number,
  changes: Partial<Pick<Field, 'type' | 'isPrimaryKey' | 'isForeignKey'>>,
): Field {
  const [row] = db.update(fields).set(changes).where(eq(fields.id, fieldId)).returning().all()
  return row
}

export function getField(db: Db, fieldId: number): Field | undefined {
  return db.select().from(fields).where(eq(fields.id, fieldId)).get()
}

export function deleteField(db: Db, fieldId: number): Field | undefined {
  const [row] = db.delete(fields).where(eq(fields.id, fieldId)).returning().all()
  return row
}
