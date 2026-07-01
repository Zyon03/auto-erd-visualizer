import type { Edge } from '@xyflow/react'
import type { FullSchema } from '../../mutations/getFullSchema'
import type { TableNodeType } from './TableNode'

export function schemaToNodes(schema: FullSchema): TableNodeType[] {
  return schema.tables.map((table) => ({
    id: String(table.id),
    type: 'table',
    position: { x: table.positionX, y: table.positionY },
    data: { tableId: table.id, name: table.name, fields: table.fields },
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
