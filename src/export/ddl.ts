import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { getFullSchema } from '../mutations/getFullSchema'

type Db = BetterSQLite3Database<typeof schema>

export function generateDdl(db: Db, sessionId: number): string {
  const { tables, relationships } = getFullSchema(db, sessionId)
  const fieldById = new Map(tables.flatMap((t) => t.fields.map((f) => [f.id, f] as const)))
  const tableByFieldId = new Map(tables.flatMap((t) => t.fields.map((f) => [f.id, t] as const)))

  const createStatements = tables.map((table) => {
    const columnLines = table.fields.map((field) => {
      const pk = field.isPrimaryKey ? ' PRIMARY KEY' : ''
      return `  ${field.name} ${field.type}${pk}`
    })
    return `CREATE TABLE ${table.name} (\n${columnLines.join(',\n')}\n);`
  })

  const foreignKeyStatements = relationships
    .map((rel) => {
      const fromField = fieldById.get(rel.fromFieldId)
      const fromTable = tableByFieldId.get(rel.fromFieldId)
      const toField = fieldById.get(rel.toFieldId)
      const toTable = tableByFieldId.get(rel.toFieldId)
      if (!fromField || !fromTable || !toField || !toTable) return ''
      return `ALTER TABLE ${toTable.name} ADD FOREIGN KEY (${toField.name}) REFERENCES ${fromTable.name}(${fromField.name});`
    })
    .filter(Boolean)

  return [...createStatements, ...foreignKeyStatements].join('\n\n')
}
