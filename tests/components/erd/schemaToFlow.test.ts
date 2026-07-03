import { describe, it, expect } from 'vitest'
import { schemaToNodes, schemaToEdges, schemaToTableEdges, schemaToNodesWithReuse } from '../../../src/components/erd/schemaToFlow'
import type { FullSchema } from '../../../src/mutations/getFullSchema'
import type { Cardinality } from '../../../src/mutations/relationships'
import type { TableNodeType, TableNodeData } from '../../../src/components/erd/TableNode'

const sampleSchema: FullSchema = {
  tables: [
    {
      id: 1,
      sessionId: 1,
      name: 'users',
      positionX: 10,
      positionY: 20,
      createdAt: '2026-01-01 00:00:00',
      roleOverride: null,
      fields: [{ id: 1, tableId: 1, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }],
    },
    {
      id: 2,
      sessionId: 1,
      name: 'orders',
      positionX: 300,
      positionY: 20,
      createdAt: '2026-01-01 00:00:00',
      roleOverride: null,
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
          roleOverride: null,
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
        { id: 3, sessionId: 1, name: 'reviews', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [{ id: 3, tableId: 3, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 }] },
        { id: 4, sessionId: 1, name: 'sessions', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [{ id: 4, tableId: 4, name: 'user_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 }] },
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

  it('keeps a many-to-many join table as two literal one-to-many lines, not a synthesized single line', () => {
    // Movie <-> Genre via a pure join table -- deliberately NOT collapsed into one M:N line (see
    // schemaToTableEdges's doc comment): the join table isn't optional in the real schema this
    // app exports, so relation view must not visually suggest it can be skipped.
    const movieGenreSchema: FullSchema = {
      tables: [
        { id: 1, sessionId: 1, name: 'Movie', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [{ id: 1, tableId: 1, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }] },
        { id: 2, sessionId: 1, name: 'Genre', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [{ id: 2, tableId: 2, name: 'id', type: 'uuid', isPrimaryKey: true, isForeignKey: false, order: 0 }] },
        {
          id: 3,
          sessionId: 1,
          name: 'MovieGenre',
          positionX: 0,
          positionY: 0,
          createdAt: '2026-01-01 00:00:00',
          roleOverride: null,
          fields: [
            { id: 3, tableId: 3, name: 'movie_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 0 },
            { id: 4, tableId: 3, name: 'genre_id', type: 'uuid', isPrimaryKey: false, isForeignKey: true, order: 1 },
          ],
        },
      ],
      relationships: [
        { id: 1, sessionId: 1, fromFieldId: 1, toFieldId: 3, cardinality: 'one-to-many', aiComment: 'A movie can have many genres' },
        { id: 2, sessionId: 1, fromFieldId: 2, toFieldId: 4, cardinality: 'one-to-many', aiComment: 'A genre applies to many movies' },
      ],
    }
    const edges = schemaToTableEdges(movieGenreSchema)
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => (e.data as { cardinality: Cardinality }).cardinality === 'one-to-many')).toBe(true)
    const targets = edges.map((e) => e.target).sort()
    expect(targets).toEqual(['3', '3'])
  })
})

describe('schemaToNodesWithReuse', () => {
  const noop = () => {}
  const baseExtras = {
    onAddField: noop,
    onRenameTable: noop,
    onRenameField: noop,
    onUpdateFieldType: noop,
    onDeleteTable: noop,
    onDeleteField: noop,
    onSetTableRole: noop,
    hideFieldHandles: false,
    newSinceThreshold: '9999-01-01 00:00:00',
  }

  function toMap(nodes: TableNodeType[]): Map<string, TableNodeType> {
    return new Map(nodes.map((n) => [n.id, n]))
  }

  // No aiComment on the users->orders relationship — its summary line falls back to a structural
  // description that names the *other* table, which is exactly the case that can go stale if a
  // table's node is only invalidated by comparing its own row.
  const schemaNoComment: FullSchema = {
    tables: sampleSchema.tables,
    relationships: [{ id: 1, sessionId: 1, fromFieldId: 1, toFieldId: 2, cardinality: 'one-to-many', aiComment: '' }],
  }

  it('reuses every node when nothing changed', () => {
    const first = schemaToNodesWithReuse(schemaNoComment, new Map(), baseExtras)
    const second = schemaToNodesWithReuse(schemaNoComment, toMap(first), baseExtras)

    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
  })

  it('gives a changed table a new node, but leaves an unrelated table untouched', () => {
    const first = schemaToNodesWithReuse(schemaNoComment, new Map(), baseExtras)
    const moved: FullSchema = {
      ...schemaNoComment,
      tables: [{ ...schemaNoComment.tables[0], positionX: 999 }, schemaNoComment.tables[1]],
    }
    const second = schemaToNodesWithReuse(moved, toMap(first), baseExtras)

    expect(second[0]).not.toBe(first[0])
    expect(second[0].position.x).toBe(999)
    expect(second[1]).toBe(first[1])
  })

  it('invalidates a table whose relationship summary text changes because the *other* table was renamed', () => {
    // orders' own row is untouched — only users' name changes, which feeds into orders' computed
    // summaryLines ("**orders** ↔ **users**" -> "...↔ **People**"). If invalidation only compared
    // a table's own row, orders would incorrectly keep showing the stale text.
    const first = schemaToNodesWithReuse(schemaNoComment, new Map(), baseExtras)
    expect(first[1].data.summaryLines).toEqual(['**orders** ↔ **users** (one-to-many)'])

    const renamed: FullSchema = {
      ...schemaNoComment,
      tables: [{ ...schemaNoComment.tables[0], name: 'People' }, schemaNoComment.tables[1]],
    }
    const second = schemaToNodesWithReuse(renamed, toMap(first), baseExtras)

    expect(second[1]).not.toBe(first[1])
    expect(second[1].data.summaryLines).toEqual(['**orders** ↔ **People** (one-to-many)'])
  })

  it('treats a changed handler reference as a change, for every table', () => {
    const first = schemaToNodesWithReuse(schemaNoComment, new Map(), baseExtras)
    const differentHandler: TableNodeData['onDeleteTable'] = () => {}
    const second = schemaToNodesWithReuse(schemaNoComment, toMap(first), { ...baseExtras, onDeleteTable: differentHandler })

    expect(second[0]).not.toBe(first[0])
    expect(second[1]).not.toBe(first[1])
  })

  it('creates a fresh node for a newly added table without disturbing existing ones', () => {
    const first = schemaToNodesWithReuse(schemaNoComment, new Map(), baseExtras)
    const withNewTable: FullSchema = {
      ...schemaNoComment,
      tables: [
        ...schemaNoComment.tables,
        { id: 3, sessionId: 1, name: 'tags', positionX: 0, positionY: 0, createdAt: '2026-01-01 00:00:00', roleOverride: null, fields: [] },
      ],
    }
    const second = schemaToNodesWithReuse(withNewTable, toMap(first), baseExtras)

    expect(second).toHaveLength(3)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
    expect(second[2].id).toBe('3')
  })
})
