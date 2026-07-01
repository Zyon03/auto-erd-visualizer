import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { getFullSchema } from '../mutations/getFullSchema'
import { addTable, renameTable, updateTablePosition, deleteTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField } from '../mutations/fields'
import { addRelationship } from '../mutations/relationships'

export const getFullSchemaFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => getFullSchema(db, data.sessionId))

export const addTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => addTable(db, data.sessionId, data.name))

export const renameTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => renameTable(db, data.tableId, data.name))

export const updateTablePositionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), positionX: z.number(), positionY: z.number() }))
  .handler(async ({ data }) => updateTablePosition(db, data.tableId, data.positionX, data.positionY))

export const deleteTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number() }))
  .handler(async ({ data }) => {
    deleteTable(db, data.tableId)
  })

export const addFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1), type: z.string().min(1) }))
  .handler(async ({ data }) => addField(db, data.tableId, data.name, data.type))

export const renameFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ fieldId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => renameField(db, data.fieldId, data.name))

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
    deleteField(db, data.fieldId)
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
