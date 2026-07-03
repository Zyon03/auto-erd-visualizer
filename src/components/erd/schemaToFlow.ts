import type { Edge } from '@xyflow/react'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { Cardinality } from '../../mutations/relationships'
import { summarizeAllTables } from '../../mutations/summarize'
import { TABLE_HANDLE_SLOTS, type TableNodeData, type TableNodeField, type TableNodeType } from './TableNode'

function buildFieldTableId(schema: FullSchema): Map<number, number> {
  const fieldTableId = new Map<number, number>()
  for (const table of schema.tables) {
    for (const field of table.fields) {
      fieldTableId.set(field.id, table.id)
    }
  }
  return fieldTableId
}

export function schemaToNodes(schema: FullSchema): TableNodeType[] {
  return schema.tables.map((table) => ({
    id: String(table.id),
    type: 'table',
    position: { x: table.positionX, y: table.positionY },
    data: {
      tableId: table.id,
      name: table.name,
      fields: table.fields,
      createdAt: table.createdAt,
      roleOverride: table.roleOverride,
    },
  }))
}

function fieldsEqual(a: TableNodeField[], b: TableNodeField[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every(
    (field, i) =>
      field.id === b[i].id &&
      field.name === b[i].name &&
      field.type === b[i].type &&
      field.isPrimaryKey === b[i].isPrimaryKey &&
      field.isForeignKey === b[i].isForeignKey,
  )
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((line, i) => line === b[i])
}

export interface TableNodeExtras {
  onAddField: TableNodeData['onAddField']
  onRenameTable: TableNodeData['onRenameTable']
  onRenameField: TableNodeData['onRenameField']
  onUpdateFieldType: TableNodeData['onUpdateFieldType']
  onDeleteTable: TableNodeData['onDeleteTable']
  onDeleteField: TableNodeData['onDeleteField']
  onSetTableRole: TableNodeData['onSetTableRole']
  hideFieldHandles: boolean
  newSinceThreshold: string
}

/**
 * Builds the canvas's node list, reusing a table's previous node object when nothing about it
 * actually changed — same position, fields, name, role, computed summary lines, and view-mode/
 * handler "extras". This matters because React Flow only re-renders a node when its own data
 * object reference changes (it reads each node from an internal store keyed by id, not by
 * diffing this whole array — see @xyflow/react's NodeWrapper). Without this, any schema edit
 * anywhere would re-render every table on the canvas, not just the one that changed, since
 * `schema` is a fresh object graph on every refetch regardless of which table's row actually
 * differs. `summaryLines` is compared by value rather than assumed stable just because a table's
 * own row didn't change — renaming table A can change what table B's summary text says about it.
 */
export function schemaToNodesWithReuse(
  schema: FullSchema,
  previous: Map<string, TableNodeType>,
  extras: TableNodeExtras,
): TableNodeType[] {
  const summaryByTable = summarizeAllTables(schema)

  return schema.tables.map((table) => {
    const id = String(table.id)
    const summaryLines = summaryByTable.get(table.id) ?? []
    const isNew = table.createdAt > extras.newSinceThreshold
    const prev = previous.get(id)

    if (
      prev &&
      prev.position.x === table.positionX &&
      prev.position.y === table.positionY &&
      prev.data.name === table.name &&
      prev.data.createdAt === table.createdAt &&
      prev.data.roleOverride === table.roleOverride &&
      prev.data.hideFieldHandles === extras.hideFieldHandles &&
      prev.data.isNew === isNew &&
      prev.data.onAddField === extras.onAddField &&
      prev.data.onRenameTable === extras.onRenameTable &&
      prev.data.onRenameField === extras.onRenameField &&
      prev.data.onUpdateFieldType === extras.onUpdateFieldType &&
      prev.data.onDeleteTable === extras.onDeleteTable &&
      prev.data.onDeleteField === extras.onDeleteField &&
      prev.data.onSetTableRole === extras.onSetTableRole &&
      fieldsEqual(prev.data.fields, table.fields) &&
      stringArraysEqual(prev.data.summaryLines ?? [], summaryLines)
    ) {
      return prev
    }

    return {
      id,
      type: 'table' as const,
      position: { x: table.positionX, y: table.positionY },
      data: {
        tableId: table.id,
        name: table.name,
        fields: table.fields,
        createdAt: table.createdAt,
        roleOverride: table.roleOverride,
        onAddField: extras.onAddField,
        onRenameTable: extras.onRenameTable,
        onRenameField: extras.onRenameField,
        onUpdateFieldType: extras.onUpdateFieldType,
        onDeleteTable: extras.onDeleteTable,
        onDeleteField: extras.onDeleteField,
        onSetTableRole: extras.onSetTableRole,
        hideFieldHandles: extras.hideFieldHandles,
        summaryLines,
        isNew,
      },
    }
  })
}

export function schemaToEdges(schema: FullSchema): Edge[] {
  // A per-relationship `schema.tables.find(t => t.fields.some(...))` scan is O(tables × fields)
  // each — O(relationships × tables × fields) total for the whole schema. Building this map once
  // up front makes each relationship's lookup O(1) instead.
  const fieldTableId = buildFieldTableId(schema)
  return schema.relationships.map((rel) => {
    const fromTableId = fieldTableId.get(rel.fromFieldId)
    const toTableId = fieldTableId.get(rel.toFieldId)
    return {
      id: String(rel.id),
      type: 'relationship',
      source: fromTableId !== undefined ? String(fromTableId) : '',
      target: toTableId !== undefined ? String(toTableId) : '',
      sourceHandle: `field-${rel.fromFieldId}`,
      targetHandle: `field-${rel.toFieldId}`,
      data: { aiComment: rel.aiComment },
    }
  })
}

/** Collapses field-to-field relationships onto a single edge per table pair — the "logical"
 *  ERD view (one line per table relationship) instead of the "physical" field-level view. A
 *  many-to-many implemented via a join table still shows as two literal one-to-many lines into
 *  that table here, on purpose: this app's whole point is producing a schema that translates to a
 *  real system, and the join table is not optional in that schema, so relation view shouldn't
 *  visually suggest otherwise by hiding it behind a single synthesized line. */
export function schemaToTableEdges(schema: FullSchema): Edge[] {
  const fieldTableId = buildFieldTableId(schema)
  const grouped = new Map<
    string,
    { fromTableId: number; toTableId: number; cardinality: Cardinality; aiComments: string[] }
  >()

  for (const rel of schema.relationships) {
    const fromTableId = fieldTableId.get(rel.fromFieldId)
    const toTableId = fieldTableId.get(rel.toFieldId)
    if (fromTableId === undefined || toTableId === undefined || fromTableId === toTableId) continue

    const key = [fromTableId, toTableId].sort((a, b) => a - b).join('-')
    const existing = grouped.get(key)
    if (existing) {
      if (rel.aiComment) existing.aiComments.push(rel.aiComment)
    } else {
      grouped.set(key, {
        fromTableId,
        toTableId,
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
