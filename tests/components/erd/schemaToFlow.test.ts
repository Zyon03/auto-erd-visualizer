import { describe, it, expect } from 'vitest'
import { schemaToNodes, schemaToEdges } from '../../../src/components/erd/schemaToFlow'
import type { FullSchema } from '../../../src/mutations/getFullSchema'

const sampleSchema: FullSchema = {
  tables: [
    {
      id: 1,
      sessionId: 1,
      name: 'users',
      positionX: 10,
      positionY: 20,
      fields: [{ id: 1, tableId: 1, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }],
    },
    {
      id: 2,
      sessionId: 1,
      name: 'orders',
      positionX: 300,
      positionY: 20,
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
