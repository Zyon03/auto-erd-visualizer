import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { relationships } from '../db/schema'

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
