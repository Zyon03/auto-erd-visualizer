import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { getFullSchema } from '../mutations/getFullSchema'
import { addTable, renameTable, updateTablePosition, deleteTable, getTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField, getField } from '../mutations/fields'
import { addRelationship } from '../mutations/relationships'
import { addChatMessage } from '../mutations/chatMessages'

export const getFullSchemaFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => getFullSchema(db, data.sessionId))

export const addTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const table = addTable(db, data.sessionId, data.name)
    addChatMessage(db, data.sessionId, 'system', `Table \`${table.name}\` added manually`)
    return table
  })

export const renameTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const before = getTable(db, data.tableId)
    const table = renameTable(db, data.tableId, data.name)
    if (before) {
      addChatMessage(db, table.sessionId, 'system', `Table \`${before.name}\` renamed to \`${table.name}\``)
    }
    return table
  })

export const updateTablePositionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), positionX: z.number(), positionY: z.number() }))
  .handler(async ({ data }) => updateTablePosition(db, data.tableId, data.positionX, data.positionY))

export const deleteTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number() }))
  .handler(async ({ data }) => {
    const deleted = deleteTable(db, data.tableId)
    if (deleted) {
      addChatMessage(db, deleted.sessionId, 'system', `Table \`${deleted.name}\` deleted manually`)
    }
  })

export const addFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1), type: z.string().min(1) }))
  .handler(async ({ data }) => {
    const field = addField(db, data.tableId, data.name, data.type)
    const table = getTable(db, data.tableId)
    if (table) {
      addChatMessage(db, table.sessionId, 'system', `Field \`${field.name}\` added to \`${table.name}\``)
    }
    return field
  })

export const renameFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ fieldId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const before = getField(db, data.fieldId)
    const field = renameField(db, data.fieldId, data.name)
    if (before) {
      const table = getTable(db, field.tableId)
      if (table) {
        addChatMessage(db, table.sessionId, 'system', `Field \`${before.name}\` renamed to \`${field.name}\``)
      }
    }
    return field
  })

export const updateFieldFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      fieldId: z.number(),
      type: z.string().min(1).optional(),
      isPrimaryKey: z.boolean().optional(),
      isForeignKey: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { fieldId, ...changes } = data
    return updateField(db, fieldId, changes)
  })

export const deleteFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ fieldId: z.number() }))
  .handler(async ({ data }) => {
    const table = getTable(db, (getField(db, data.fieldId))?.tableId ?? -1)
    const deleted = deleteField(db, data.fieldId)
    if (deleted && table) {
      addChatMessage(db, table.sessionId, 'system', `Field \`${deleted.name}\` deleted`)
    }
  })

export const addRelationshipFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      sessionId: z.number(),
      fromFieldId: z.number(),
      toFieldId: z.number(),
      cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
    }),
  )
  .handler(async ({ data }) =>
    addRelationship(db, data.sessionId, data.fromFieldId, data.toFieldId, data.cardinality),
  )
