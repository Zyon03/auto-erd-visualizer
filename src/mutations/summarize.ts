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

/** `**ThisTable** ↔ **OtherTable** — <comment> (<cardinality>)`. The two table names are always
 *  bolded regardless of how the AI's own `aiComment` prose happens to word things -- deliberately
 *  not attempting to find-and-bold a table's name *inside* the comment text, since a table like
 *  `M_Person` might be discussed as "cast member" or "actor" there. Pulling the real names out to
 *  a fixed prefix is accurate every time, independent of phrasing. Rendered by TableNode's summary
 *  dialog, which parses the `**...**` markers into <strong> (see renderBoldedLine there). */
function formatSummaryLine(thisName: string, otherName: string, aiComment: string, cardinality: string): string {
  const prefix = `**${thisName}** ↔ **${otherName}**`
  return aiComment ? `${prefix} — ${aiComment} (${cardinality})` : `${prefix} (${cardinality})`
}

/** Groups a table's existing relationship notes (the AI's own `aiComment`s) rather than
 *  generating new text. Relationships created by manually dragging a connection have no
 *  `aiComment` (only the AI's `add_relationship` tool call supplies one), so those fall back to
 *  a minimal structural description instead of an empty line. */
export function summarizeTable(schema: FullSchema, tableId: number): string[] {
  const fieldTableId = buildFieldTableId(schema)
  const tableNameById = new Map(schema.tables.map((t) => [t.id, t.name]))
  const thisName = tableNameById.get(tableId) ?? `table #${tableId}`

  const lines: string[] = []
  for (const rel of schema.relationships) {
    const fromTableId = fieldTableId.get(rel.fromFieldId)
    const toTableId = fieldTableId.get(rel.toFieldId)
    if (fromTableId === undefined || toTableId === undefined) continue
    if (fromTableId !== tableId && toTableId !== tableId) continue

    const otherTableId = fromTableId === tableId ? toTableId : fromTableId
    const otherName = tableNameById.get(otherTableId) ?? `table #${otherTableId}`

    lines.push(formatSummaryLine(thisName, otherName, rel.aiComment, rel.cardinality))
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

    const fromName = tableNameById.get(fromTableId) ?? `table #${fromTableId}`
    const toName = tableNameById.get(toTableId) ?? `table #${toTableId}`

    linesByTable.get(fromTableId)?.push(formatSummaryLine(fromName, toName, rel.aiComment, rel.cardinality))
    // Self-referencing relationships (fromTableId === toTableId) only get the one line above —
    // matches summarizeTable, which never double-counts a relationship for a single table.
    if (toTableId !== fromTableId) {
      linesByTable.get(toTableId)?.push(formatSummaryLine(toName, fromName, rel.aiComment, rel.cardinality))
    }
  }
  return linesByTable
}
