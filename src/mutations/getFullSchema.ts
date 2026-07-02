import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { tables, fields, relationships } from '../db/schema'
import type { Field } from './fields'
import type { Relationship } from './relationships'

type Db = BetterSQLite3Database<typeof schema>

export interface TableWithFields {
  id: number
  sessionId: number
  name: string
  positionX: number
  positionY: number
  createdAt: string
  fields: Field[]
}

export interface FullSchema {
  tables: TableWithFields[]
  relationships: Relationship[]
}

export function getFullSchema(db: Db, sessionId: number): FullSchema {
  const tableRows = db.select().from(tables).where(eq(tables.sessionId, sessionId)).all()
  const fieldRows = db.select().from(fields).all()
  const relationshipRows = db
    .select()
    .from(relationships)
    .where(eq(relationships.sessionId, sessionId))
    .all()

  const tablesWithFields: TableWithFields[] = tableRows.map((table) => ({
    ...table,
    fields: fieldRows.filter((field) => field.tableId === table.id).sort((a, b) => a.order - b.order),
  }))

  return { tables: tablesWithFields, relationships: relationshipRows }
}
