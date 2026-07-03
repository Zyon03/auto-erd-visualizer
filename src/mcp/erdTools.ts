import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { addTable, renameTable, deleteTable, getTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField, getField } from '../mutations/fields'
import { addRelationship, updateRelationship, deleteRelationship, type Cardinality } from '../mutations/relationships'
import { getFullSchema } from '../mutations/getFullSchema'
import { getSession, renameSession } from '../mutations/sessions'
import type { TableRole } from '../mutations/tableRole'

type Db = BetterSQLite3Database<typeof schema>

// Both real creation call sites (routes/index.tsx, SessionSidebar.tsx) name a fresh session
// "Session <n>" — used as a cheap "has a human already named this?" check so rename_session
// (itself only offered to the model on a session's first turn, see runTurn.ts) never overwrites
// a name someone set on purpose, including the edge case of renaming before ever sending a
// first chat message.
const DEFAULT_SESSION_NAME_PATTERN = /^Session \d+$/

/** `Table.field` for a relationship's activity-log line -- without this, every add_relationship
 *  step reads as the identical generic "Linked fields with a one-to-many relationship" regardless
 *  of which fields were actually involved, which is exactly why a many-to-many built correctly as
 *  two one-to-many join-table FKs (the only way to represent M:N in a real relational schema)
 *  reads as suspicious/repetitive in the log instead of self-explanatory. */
function describeField(db: Db, fieldId: number): string {
  const field = getField(db, fieldId)
  if (!field) return `field #${fieldId}`
  const table = getTable(db, field.tableId)
  return table ? `${table.name}.${field.name}` : field.name
}

export interface ErdToolResult {
  summary: string
  data?: unknown
}

export function createErdTools(db: Db, sessionId: number) {
  return {
    get_schema: (): ErdToolResult => {
      const schemaData = getFullSchema(db, sessionId)
      return { summary: `Schema has ${schemaData.tables.length} table(s).`, data: schemaData }
    },

    add_table: (input: { name: string; role?: TableRole }): ErdToolResult => {
      const table = addTable(db, sessionId, input.name, input.role ?? null)
      return { summary: `Added table \`${table.name}\``, data: table }
    },

    rename_table: (input: { tableId: number; name: string }): ErdToolResult => {
      const table = renameTable(db, input.tableId, input.name)
      return { summary: `Renamed table to \`${table.name}\``, data: table }
    },

    delete_table: (input: { tableId: number }): ErdToolResult => {
      const table = deleteTable(db, input.tableId)
      return { summary: table ? `Deleted table \`${table.name}\`` : `Table #${input.tableId} was already gone`, data: table }
    },

    add_field: (input: {
      tableId: number
      name: string
      type: string
      isPrimaryKey?: boolean
      isForeignKey?: boolean
    }): ErdToolResult => {
      const field = addField(db, input.tableId, input.name, input.type, input.isPrimaryKey ?? false, input.isForeignKey ?? false)
      return { summary: `Added field \`${field.name}\` (${field.type})`, data: field }
    },

    rename_field: (input: { fieldId: number; name: string }): ErdToolResult => {
      const field = renameField(db, input.fieldId, input.name)
      return { summary: `Renamed field to \`${field.name}\``, data: field }
    },

    update_field: (input: {
      fieldId: number
      type?: string
      isPrimaryKey?: boolean
      isForeignKey?: boolean
    }): ErdToolResult => {
      const { fieldId, ...changes } = input
      const field = updateField(db, fieldId, changes)
      return { summary: `Updated field \`${field.name}\``, data: field }
    },

    delete_field: (input: { fieldId: number }): ErdToolResult => {
      const field = deleteField(db, input.fieldId)
      return { summary: field ? `Deleted field \`${field.name}\`` : `Field #${input.fieldId} was already gone`, data: field }
    },

    add_relationship: (input: {
      fromFieldId: number
      toFieldId: number
      cardinality: Cardinality
      aiComment?: string
    }): ErdToolResult => {
      const rel = addRelationship(db, sessionId, input.fromFieldId, input.toFieldId, input.cardinality, input.aiComment ?? '')
      const from = describeField(db, input.fromFieldId)
      const to = describeField(db, input.toFieldId)
      return { summary: `Linked \`${from}\` → \`${to}\` (${rel.cardinality})`, data: rel }
    },

    update_relationship: (input: {
      relationshipId: number
      cardinality?: Cardinality
      aiComment?: string
    }): ErdToolResult => {
      const { relationshipId, ...changes } = input
      const rel = updateRelationship(db, relationshipId, changes)
      return {
        summary: rel ? `Updated relationship #${rel.id}` : `Relationship #${relationshipId} was already gone`,
        data: rel,
      }
    },

    delete_relationship: (input: { relationshipId: number }): ErdToolResult => {
      deleteRelationship(db, input.relationshipId)
      return { summary: `Deleted relationship #${input.relationshipId}` }
    },

    // Doesn't mutate the schema — purely a signal the app renders as a clickable question. The
    // summary doubles as an instruction back to the model, since this is the only way to make a
    // single headless `claude -p` invocation "pause": stop calling tools and let the turn end.
    ask_question: (input: { question: string; choices?: string[]; allowMultiple?: boolean }): ErdToolResult => {
      return {
        summary: 'Question presented to the user. Wait for their reply before continuing — do not call more tools this turn.',
        data: input,
      }
    },

    rename_session: (input: { name: string }): ErdToolResult => {
      const session = getSession(db, sessionId)
      if (!session) return { summary: `Session #${sessionId} was already gone` }
      if (!DEFAULT_SESSION_NAME_PATTERN.test(session.name)) {
        return { summary: `Session already has a name (\`${session.name}\`) — leaving it as is.` }
      }
      const renamed = renameSession(db, sessionId, input.name.trim())
      return { summary: `Renamed session to \`${renamed.name}\``, data: renamed }
    },
  }
}

export type ErdTools = ReturnType<typeof createErdTools>
export type ErdToolName = keyof ErdTools
