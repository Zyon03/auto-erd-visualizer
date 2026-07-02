import type { Edge } from '@xyflow/react'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { Cardinality } from '../../mutations/relationships'
import { TABLE_HANDLE_SLOTS, type TableNodeType } from './TableNode'

export function schemaToNodes(schema: FullSchema): TableNodeType[] {
  return schema.tables.map((table) => ({
    id: String(table.id),
    type: 'table',
    position: { x: table.positionX, y: table.positionY },
    data: { tableId: table.id, name: table.name, fields: table.fields, createdAt: table.createdAt },
  }))
}

export function schemaToEdges(schema: FullSchema): Edge[] {
  return schema.relationships.map((rel) => {
    const fromTable = schema.tables.find((t) => t.fields.some((f) => f.id === rel.fromFieldId))
    const toTable = schema.tables.find((t) => t.fields.some((f) => f.id === rel.toFieldId))
    return {
      id: String(rel.id),
      type: 'relationship',
      source: String(fromTable?.id ?? ''),
      target: String(toTable?.id ?? ''),
      sourceHandle: `field-${rel.fromFieldId}`,
      targetHandle: `field-${rel.toFieldId}`,
      data: { aiComment: rel.aiComment },
    }
  })
}

/** Collapses field-to-field relationships onto a single edge per table pair — the "logical"
 *  ERD view (one line per table relationship) instead of the "physical" field-level view. */
export function schemaToTableEdges(schema: FullSchema): Edge[] {
  const grouped = new Map<
    string,
    { fromTableId: number; toTableId: number; cardinality: Cardinality; aiComments: string[] }
  >()

  for (const rel of schema.relationships) {
    const fromTable = schema.tables.find((t) => t.fields.some((f) => f.id === rel.fromFieldId))
    const toTable = schema.tables.find((t) => t.fields.some((f) => f.id === rel.toFieldId))
    if (!fromTable || !toTable || fromTable.id === toTable.id) continue

    const key = [fromTable.id, toTable.id].sort((a, b) => a - b).join('-')
    const existing = grouped.get(key)
    if (existing) {
      if (rel.aiComment) existing.aiComments.push(rel.aiComment)
    } else {
      grouped.set(key, {
        fromTableId: fromTable.id,
        toTableId: toTable.id,
        cardinality: rel.cardinality,
        aiComments: rel.aiComment ? [rel.aiComment] : [],
      })
    }
  }

  // Round-robin each table's own slots across all the relationships touching it, so multiple
  // edges into the same table spread across its perimeter instead of stacking on one point.
  const nextSlot = new Map<number, number>()
  function assignSlot(tableId: number): number {
    const slot = (nextSlot.get(tableId) ?? 0) % TABLE_HANDLE_SLOTS
    nextSlot.set(tableId, slot + 1)
    return slot
  }

  return Array.from(grouped.entries()).map(([key, group]) => ({
    id: `table-rel-${key}`,
    type: 'tableRelation',
    source: String(group.fromTableId),
    target: String(group.toTableId),
    sourceHandle: `table-${group.fromTableId}-${assignSlot(group.fromTableId)}`,
    targetHandle: `table-${group.toTableId}-${assignSlot(group.toTableId)}`,
    data: { cardinality: group.cardinality, aiComments: group.aiComments },
  }))
}
