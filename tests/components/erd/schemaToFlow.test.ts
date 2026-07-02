import { describe, it, expect } from 'vitest'
import { schemaToNodes, schemaToEdges, schemaToTableEdges } from '../../../src/components/erd/schemaToFlow'
import type { FullSchema } from '../../../src/mutations/getFullSchema'

const sampleSchema: FullSchema = {
  tables: [
    {
      id: 1,
      sessionId: 1,
      name: 'users',
      positionX: 10,
      positionY: 20,
      createdAt: '2026-01-01 00:00:00',
      fields: [{ id: 1, tableId: 1, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }],
    },
    {
      id: 2,
      sessionId: 1,
      name: 'orders',
      positionX: 300,
      positionY: 20,
      createdAt: '2026-01-01 00:00:00',
      fields: [
        { id: 2, tableId: 2, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 },
      ],
    },
  ],
  relationships: [
    { id: 1, sessionId: 1, fromFieldId: 1, toFieldId: 2, cardinality: 'one-to-many', aiComment: 'A user has many orders' },
  ],
}

describe('schemaToNodes', () => {
  it('maps each table to a positioned node with its fields', () => {
    const nodes = schemaToNodes(sampleSchema)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ id: '1', type: 'table', position: { x: 10, y: 20 } })
    expect(nodes[0].data.fields).toHaveLength(1)
  })
})

describe('schemaToEdges', () => {
  it('maps each relationship to an edge between the owning tables', () => {
    const edges = schemaToEdges(sampleSchema)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ id: '1', source: '1', target: '2', type: 'relationship' })
    expect(edges[0].data).toMatchObject({ aiComment: 'A user has many orders' })
  })
})

describe('schemaToTableEdges', () => {
  it('maps a relationship to a table-to-table edge', () => {
    const edges = schemaToTableEdges(sampleSchema)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      source: '1',
      target: '2',
      type: 'tableRelation',
      sourceHandle: 'table-1-0',
      targetHandle: 'table-2-0',
    })
    expect(edges[0].data).toMatchObject({ cardinality: 'one-to-many', aiComments: ['A user has many orders'] })
  })

  it('collapses multiple field-level relationships between the same two tables into one edge', () => {
    const schemaWithTwoLinks: FullSchema = {
      tables: [
        sampleSchema.tables[0],
        {
          id: 2,
          sessionId: 1,
          name: 'orders',
          positionX: 300,
          positionY: 20,
          createdAt: '2026-01-01 00:00:00',
          fields: [
            { id: 2, tableId: 2, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 },
            {
              id: 3,
              tableId: 2,
              name: 'referred_by_user_id',
              type: 'uuid',
              isPrimaryKey: false,
              isForeignKey: true,
              order: 1,
            },
          ],
        },
      ],
      relationships: [
        ...sampleSchema.relationships,
        { id: 2, sessionId: 1, fromFieldId: 1, toFieldId: 3, cardinality: 'one-to-many', aiComment: 'A user referred the order' },
      ],
    }
    const edges = schemaToTableEdges(schemaWithTwoLinks)
    expect(edges).toHaveLength(1)
    expect(edges[0].data).toMatchObject({
      aiComments: ['A user has many orders', 'A user referred the order'],
    })
  })

  it('spreads multiple relationships touching the same table across different handle slots', () => {
    const hubSchema: FullSchema = {
      tables: [
        sampleSchema.tables[0],
        sampleSchema.tables[1],
        { id: 3, sessionId: 1, name: 'reviews', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', fields: [{ id: 3, tableId: 3, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 }] },
        { id: 4, sessionId: 1, name: 'sessions', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', fields: [{ id: 4, tableId: 4, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 }] },
      ],
      relationships: [
        { id: 1, sessionId: 1, fromFieldId: 1, toFieldId: 2, cardinality: 'one-to-many', aiComment: '' },
        { id: 2, sessionId: 1, fromFieldId: 1, toFieldId: 3, cardinality: 'one-to-many', aiComment: '' },
        { id: 3, sessionId: 1, fromFieldId: 1, toFieldId: 4, cardinality: 'one-to-many', aiComment: '' },
      ],
    }
    const edges = schemaToTableEdges(hubSchema)
    expect(edges).toHaveLength(3)
    // All three relationships touch table 1 as the "from" side — each should land on a
    // distinct slot instead of all three colliding on the same handle.
    const usersSlots = edges.map((e) => e.sourceHandle)
    expect(new Set(usersSlots).size).toBe(3)
  })

  it('skips a relationship between two fields on the same table', () => {
    const selfReferencing: FullSchema = {
      tables: sampleSchema.tables,
      relationships: [{ id: 3, sessionId: 1, fromFieldId: 1, toFieldId: 1, cardinality: 'one-to-many', aiComment: '' }],
    }
    expect(schemaToTableEdges(selfReferencing)).toHaveLength(0)
  })
})
