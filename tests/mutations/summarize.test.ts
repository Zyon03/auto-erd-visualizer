import { describe, it, expect } from 'vitest'
import { summarizeTable, summarizeAllTables } from '../../src/mutations/summarize'
import type { FullSchema } from '../../src/mutations/getFullSchema'

const schema: FullSchema = {
  tables: [
    {
      id: 1,
      sessionId: 1,
      name: 'users',
      positionX: 0,
      positionY: 0,
      createdAt: '2026-01-01 00:00:00',
      roleOverride: null,
      fields: [{ id: 1, tableId: 1, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }],
    },
    {
      id: 2,
      sessionId: 1,
      name: 'orders',
      positionX: 0,
      positionY: 0,
      createdAt: '2026-01-01 00:00:00',
      roleOverride: null,
      fields: [
        { id: 2, tableId: 2, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 },
      ],
    },
    {
      id: 3,
      sessionId: 1,
      name: 'tags',
      positionX: 0,
      positionY: 0,
      createdAt: '2026-01-01 00:00:00',
      roleOverride: null,
      fields: [{ id: 3, tableId: 3, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }],
    },
  ],
  relationships: [
    { id: 1, sessionId: 1, fromFieldId: 1, toFieldId: 2, cardinality: 'one-to-many', aiComment: 'A user has many orders' },
    { id: 2, sessionId: 1, fromFieldId: 1, toFieldId: 3, cardinality: 'many-to-many', aiComment: '' },
  ],
}

describe('summarizeTable', () => {
  it('uses the existing AI-written note when present', () => {
    expect(summarizeTable(schema, 1)).toContain('A user has many orders')
  })

  it('falls back to a structural description when aiComment is empty', () => {
    const lines = summarizeTable(schema, 1)
    expect(lines).toContain('many-to-many relationship with tags')
  })

  it('includes relationships from either side of the table', () => {
    expect(summarizeTable(schema, 2)).toEqual(['A user has many orders'])
  })

  it('returns an empty list for a table with no relationships', () => {
    const isolated: FullSchema = {
      tables: [
        { id: 4, sessionId: 1, name: 'settings', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [] },
      ],
      relationships: [],
    }
    expect(summarizeTable(isolated, 4)).toEqual([])
  })
})

describe('summarizeAllTables', () => {
  it('matches calling summarizeTable once per table, in one pass instead of one per table', () => {
    const bulk = summarizeAllTables(schema)
    for (const table of schema.tables) {
      expect(bulk.get(table.id)).toEqual(summarizeTable(schema, table.id))
    }
  })

  it('does not double-count a self-referencing relationship', () => {
    const selfRef: FullSchema = {
      tables: [
        {
          id: 5,
          sessionId: 1,
          name: 'employees',
          positionX: 0,
          positionY: 0,
          createdAt: '2026-01-01 00:00:00',
          roleOverride: null,
          fields: [
            { id: 10, tableId: 5, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 },
            { id: 11, tableId: 5, name: 'manager_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 1 },
          ],
        },
      ],
      relationships: [
        { id: 3, sessionId: 1, fromFieldId: 10, toFieldId: 11, cardinality: 'one-to-many', aiComment: 'A manager has many reports' },
      ],
    }
    expect(summarizeAllTables(selfRef).get(5)).toEqual(summarizeTable(selfRef, 5))
    expect(summarizeAllTables(selfRef).get(5)).toHaveLength(1)
  })
})
