import type { FullSchema } from './getFullSchema'

/** Groups a table's existing relationship notes (the AI's own `aiComment`s) rather than
 *  generating new text. Relationships created by manually dragging a connection have no
 *  `aiComment` (only the AI's `add_relationship` tool call supplies one), so those fall back to
 *  a minimal structural description instead of an empty line. */
export function summarizeTable(schema: FullSchema, tableId: number): string[] {
  const fieldTableId = new Map<number, number>()
  for (const table of schema.tables) {
    for (const field of table.fields) {
      fieldTableId.set(field.id, table.id)
    }
  }
  const tableNameById = new Map(schema.tables.map((t) => [t.id, t.name]))

  const lines: string[] = []
  for (const rel of schema.relationships) {
    const fromTableId = fieldTableId.get(rel.fromFieldId)
    const toTableId = fieldTableId.get(rel.toFieldId)
    if (fromTableId === undefined || toTableId === undefined) continue
    if (fromTableId !== tableId && toTableId !== tableId) continue

    const otherTableId = fromTableId === tableId ? toTableId : fromTableId
    const otherName = tableNameById.get(otherTableId) ?? `table #${otherTableId}`

    lines.push(rel.aiComment || `${rel.cardinality} relationship with ${otherName}`)
  }
  return lines
}
