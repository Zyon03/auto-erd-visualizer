import type { FullSchema } from './getFullSchema'

function buildFieldTableId(schema: FullSchema): Map<number, number> {
  const fieldTableId = new Map<number, number>()
  for (const table of schema.tables) {
    for (const field of table.fields) {
      fieldTableId.set(field.id, table.id)
    }
  }
  return fieldTableId
}

/** Groups a table's existing relationship notes (the AI's own `aiComment`s) rather than
 *  generating new text. Relationships created by manually dragging a connection have no
 *  `aiComment` (only the AI's `add_relationship` tool call supplies one), so those fall back to
 *  a minimal structural description instead of an empty line. */
export function summarizeTable(schema: FullSchema, tableId: number): string[] {
  const fieldTableId = buildFieldTableId(schema)
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

/** Same output as calling summarizeTable once per table, but in one pass over the schema instead
 *  of one full pass per table — summarizeTable alone is O(tables) full-schema scans, so calling
 *  it per table (as ErdCanvas needs, to build every table's summary for its dialog) was
 *  effectively O(tables²). This is the version ErdCanvas should actually use. */
export function summarizeAllTables(schema: FullSchema): Map<number, string[]> {
  const fieldTableId = buildFieldTableId(schema)
  const tableNameById = new Map(schema.tables.map((t) => [t.id, t.name]))
  const linesByTable = new Map<number, string[]>(schema.tables.map((t) => [t.id, []]))

  for (const rel of schema.relationships) {
    const fromTableId = fieldTableId.get(rel.fromFieldId)
    const toTableId = fieldTableId.get(rel.toFieldId)
    if (fromTableId === undefined || toTableId === undefined) continue

    const describe = (otherTableId: number) =>
      rel.aiComment || `${rel.cardinality} relationship with ${tableNameById.get(otherTableId) ?? `table #${otherTableId}`}`

    linesByTable.get(fromTableId)?.push(describe(toTableId))
    // Self-referencing relationships (fromTableId === toTableId) only get the one line above —
    // matches summarizeTable, which never double-counts a relationship for a single table.
    if (toTableId !== fromTableId) {
      linesByTable.get(toTableId)?.push(describe(fromTableId))
    }
  }
  return linesByTable
}
