import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { addTable, renameTable, deleteTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField } from '../mutations/fields'
import { addRelationship, updateRelationship, deleteRelationship, type Cardinality } from '../mutations/relationships'
import { getFullSchema } from '../mutations/getFullSchema'

type Db = BetterSQLite3Database<typeof schema>

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

    add_table: (input: { name: string }): ErdToolResult => {
      const table = addTable(db, sessionId, input.name)
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
      return { summary: `Linked fields with a ${rel.cardinality} relationship`, data: rel }
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
  }
}

export type ErdTools = ReturnType<typeof createErdTools>
export type ErdToolName = keyof ErdTools
