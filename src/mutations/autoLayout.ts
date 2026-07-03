import { Graph, layout as dagreLayout } from '@dagrejs/dagre'
import type { FullSchema } from './getFullSchema'

export interface LayoutPosition {
  positionX: number
  positionY: number
}

// Rough box-size estimate — the real rendered size (TableNode.tsx) depends on font metrics and
// field/type text length that aren't known here, so this errs generous rather than measuring
// exactly; dagre only needs "big enough to not overlap," not pixel-perfect.
const NODE_WIDTH = 300
const HEADER_HEIGHT = 40
const FIELD_ROW_HEIGHT = 28
const FOOTER_HEIGHT = 32
const NODE_SEP = 60
const RANK_SEP = 100

function estimateNodeHeight(fieldCount: number): number {
  return HEADER_HEIGHT + Math.max(fieldCount, 1) * FIELD_ROW_HEIGHT + FOOTER_HEIGHT
}

/**
 * Picks which side of a relationship is "upstream" for layout purposes. The table holding the
 * foreign key depends on the table it references, so pointing the graph edge from the referenced
 * table to the FK-holding table naturally ranks reference/lookup tables upstream and dependent
 * tables downstream — which is what "organize by how connected/dependent tables are" actually
 * means for an ERD.
 *
 * Deliberately reads each field's own isForeignKey flag rather than table naming conventions
 * (e.g. the M_/T_ prefixes the AI defaults to per the system prompt) — that's just a naming
 * convention, nothing enforces it, and plenty of schemas (manually built, imported, or renamed)
 * won't follow it. Falls back to toField's table when the flags don't disambiguate, mirroring
 * the same tie-break relationships.ts's moveForeignKeyTableNearReference already uses.
 */
function upstreamDownstream(
  fieldTableId: Map<number, number>,
  fieldIsForeignKey: Map<number, boolean>,
  rel: { fromFieldId: number; toFieldId: number },
): { upstream: number; downstream: number } | null {
  const fromTableId = fieldTableId.get(rel.fromFieldId)
  const toTableId = fieldTableId.get(rel.toFieldId)
  if (fromTableId === undefined || toTableId === undefined || fromTableId === toTableId) return null

  const fromIsForeignKey = (fieldIsForeignKey.get(rel.fromFieldId) ?? false) && !(fieldIsForeignKey.get(rel.toFieldId) ?? false)
  return fromIsForeignKey ? { upstream: toTableId, downstream: fromTableId } : { upstream: fromTableId, downstream: toTableId }
}

/** Lays out the whole schema as a directed graph (tables = nodes, relationships = edges) instead
 *  of a naive grid, so tables end up grouped and ordered by how they actually connect. */
export function computeAutoLayout(schemaData: FullSchema): Map<number, LayoutPosition> {
  const graph = new Graph()
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEP, ranksep: RANK_SEP })
  graph.setDefaultEdgeLabel(() => ({}))

  for (const table of schemaData.tables) {
    graph.setNode(String(table.id), { width: NODE_WIDTH, height: estimateNodeHeight(table.fields.length) })
  }

  const fieldTableId = new Map<number, number>()
  const fieldIsForeignKey = new Map<number, boolean>()
  for (const table of schemaData.tables) {
    for (const field of table.fields) {
      fieldTableId.set(field.id, table.id)
      fieldIsForeignKey.set(field.id, field.isForeignKey)
    }
  }

  for (const rel of schemaData.relationships) {
    const direction = upstreamDownstream(fieldTableId, fieldIsForeignKey, rel)
    if (!direction) continue
    graph.setEdge(String(direction.upstream), String(direction.downstream))
  }

  dagreLayout(graph)

  const positions = new Map<number, LayoutPosition>()
  for (const table of schemaData.tables) {
    const node = graph.node(String(table.id))
    if (!node) continue
    // dagre positions nodes by center; the app stores each table's top-left corner.
    positions.set(table.id, { positionX: node.x - node.width / 2, positionY: node.y - node.height / 2 })
  }
  return positions
}
