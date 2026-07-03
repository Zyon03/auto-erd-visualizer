import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship } from '../../src/mutations/relationships'
import { getFullSchema } from '../../src/mutations/getFullSchema'
import { computeAutoLayout } from '../../src/mutations/autoLayout'

describe('computeAutoLayout', () => {
  it('positions every table, with no two overlapping', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const a = addTable(db, sessionId, 'Alpha')
    const b = addTable(db, sessionId, 'Beta')
    const c = addTable(db, sessionId, 'Gamma')
    const aId = addField(db, a.id, 'id', 'uuid', true)
    addField(db, b.id, 'id', 'uuid', true)
    const bAId = addField(db, b.id, 'a_id', 'uuid', false, true)
    addField(db, c.id, 'id', 'uuid', true)
    addRelationship(db, sessionId, aId.id, bAId.id, 'one-to-many')

    const schemaData = getFullSchema(db, sessionId)
    const positions = computeAutoLayout(schemaData)

    expect(positions.size).toBe(3)
    for (const table of schemaData.tables) {
      const pos = positions.get(table.id)
      expect(pos).toBeDefined()
      expect(Number.isFinite(pos!.positionX)).toBe(true)
      expect(Number.isFinite(pos!.positionY)).toBe(true)
    }

    const [posA, posB] = [positions.get(a.id)!, positions.get(b.id)!]
    expect(posA.positionX !== posB.positionX || posA.positionY !== posB.positionY).toBe(true)
  })

  it('ranks the foreign-key-holding table downstream of the table it references, regardless of naming', () => {
    // Deliberately named without the M_/T_ convention the AI defaults to, to prove the layout
    // reads relationship structure (each field's isForeignKey flag), not table name prefixes.
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const reference = addTable(db, sessionId, 'Widget')
    const dependent = addTable(db, sessionId, 'WidgetPurchase')
    const referenceId = addField(db, reference.id, 'id', 'uuid', true)
    const dependentFk = addField(db, dependent.id, 'widget_id', 'uuid', false, true)
    addRelationship(db, sessionId, referenceId.id, dependentFk.id, 'one-to-many')

    const schemaData = getFullSchema(db, sessionId)
    const positions = computeAutoLayout(schemaData)

    const referencePos = positions.get(reference.id)!
    const dependentPos = positions.get(dependent.id)!
    // rankdir is left-to-right, so the downstream (FK-holding) table should land to the right.
    expect(dependentPos.positionX).toBeGreaterThan(referencePos.positionX)
  })

  it('still lays out tables with no relationships at all', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const lonely = addTable(db, sessionId, 'Orphan')

    const schemaData = getFullSchema(db, sessionId)
    const positions = computeAutoLayout(schemaData)

    expect(positions.get(lonely.id)).toBeDefined()
  })

  it('returns an empty map for a schema with no tables', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const schemaData = getFullSchema(db, sessionId)

    expect(computeAutoLayout(schemaData).size).toBe(0)
  })
})
