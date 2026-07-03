export type TableRole = 'master' | 'transactional'

export interface ClassifiableTable {
  fields: { isForeignKey: boolean }[]
  roleOverride: TableRole | null
}

/**
 * A table that holds at least one foreign key depends on other tables — the hallmark of
 * transactional/activity data (orders, payments, events). A table with none is reference/lookup
 * data that other tables point to instead. Reads each field's own isForeignKey flag rather than
 * table naming (e.g. the M_/T_ prefixes the AI defaults to per its system prompt) — that's just a
 * convention, nothing enforces it, and plenty of schemas won't follow it. Same signal
 * src/mutations/autoLayout.ts already uses to rank tables upstream/downstream.
 *
 * `roleOverride` lets a user pin the tag by hand when the heuristic gets a specific table wrong
 * (e.g. a join table that happens to hold no FK yet, or one that's conceptually reference data
 * despite pointing at something) — it always wins over the inferred value.
 */
export function classifyTableRole(table: ClassifiableTable): TableRole {
  if (table.roleOverride) return table.roleOverride
  return table.fields.some((field) => field.isForeignKey) ? 'transactional' : 'master'
}
