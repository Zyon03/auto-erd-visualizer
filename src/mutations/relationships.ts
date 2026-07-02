import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { relationships, tables } from '../db/schema'
import { getField } from './fields'
import { placeTableIfAutoPositioned } from './tables'
import { positionNear } from './layout'

type Db = BetterSQLite3Database<typeof schema>

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many'

export interface Relationship {
  id: number
  sessionId: number
  fromFieldId: number
  toFieldId: number
  cardinality: Cardinality
  aiComment: string
}

export function addRelationship(
  db: Db,
  sessionId: number,
  fromFieldId: number,
  toFieldId: number,
  cardinality: Cardinality,
  aiComment = '',
): Relationship {
  if (fromFieldId === toFieldId) {
    throw new Error('A field cannot have a relationship with itself.')
  }

  const existingForSession = db.select().from(relationships).where(eq(relationships.sessionId, sessionId)).all()
  const isDuplicate = existingForSession.some(
    (rel) =>
      (rel.fromFieldId === fromFieldId && rel.toFieldId === toFieldId) ||
      (rel.fromFieldId === toFieldId && rel.toFieldId === fromFieldId),
  )
  if (isDuplicate) {
    throw new Error('These two fields already have a relationship.')
  }

  const [row] = db
    .insert(relationships)
    .values({ sessionId, fromFieldId, toFieldId, cardinality, aiComment })
    .returning()
    .all()

  moveForeignKeyTableNearReference(db, sessionId, fromFieldId, toFieldId)

  return row
}

export function updateRelationship(
  db: Db,
  relationshipId: number,
  changes: Partial<Pick<Relationship, 'cardinality' | 'aiComment'>>,
): Relationship | undefined {
  const [row] = db
    .update(relationships)
    .set(changes)
    .where(eq(relationships.id, relationshipId))
    .returning()
    .all()
  return row
}

export function deleteRelationship(db: Db, relationshipId: number): void {
  db.delete(relationships).where(eq(relationships.id, relationshipId)).run()
}

/** Nudges the FK-holding table's side of a new relationship closer to the table it references,
 *  unless it's already been manually positioned (see `placeTableIfAutoPositioned`). The
 *  relationship's `fromFieldId`/`toFieldId` order isn't a reliable signal for which side holds
 *  the FK — manual drag-to-connect sets it by drag direction, not schema semantics — so this
 *  uses each field's own `isForeignKey` flag instead, falling back to `toField`'s table (the
 *  AI's typical creation order) if the flag is ambiguous. */
function moveForeignKeyTableNearReference(db: Db, sessionId: number, fromFieldId: number, toFieldId: number) {
  const fromField = getField(db, fromFieldId)
  const toField = getField(db, toFieldId)
  if (!fromField || !toField || fromField.tableId === toField.tableId) return

  const fromIsForeignKey = fromField.isForeignKey && !toField.isForeignKey
  const movingTableId = fromIsForeignKey ? fromField.tableId : toField.tableId
  const referenceTableId = fromIsForeignKey ? toField.tableId : fromField.tableId

  const tablePositions = db
    .select({ id: tables.id, positionX: tables.positionX, positionY: tables.positionY })
    .from(tables)
    .where(eq(tables.sessionId, sessionId))
    .all()

  const reference = tablePositions.find((t) => t.id === referenceTableId)
  if (!reference) return

  const { positionX, positionY } = positionNear(reference, tablePositions, movingTableId)
  placeTableIfAutoPositioned(db, movingTableId, positionX, positionY)
}
