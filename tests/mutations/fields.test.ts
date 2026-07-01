import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable, deleteTable } from '../../src/mutations/tables'
import { addField, renameField, updateField, deleteField } from '../../src/mutations/fields'

describe('field mutations', () => {
  let db: ReturnType<typeof createDb>
  let tableId: number

  beforeEach(() => {
    db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    tableId = addTable(db, sessionId, 'users').id
  })

  it('adds fields with incrementing order', () => {
    const id = addField(db, tableId, 'id', 'uuid', true)
    const name = addField(db, tableId, 'name', 'text')
    expect(id.order).toBe(0)
    expect(name.order).toBe(1)
    expect(id.isPrimaryKey).toBe(true)
  })

  it('renames a field', () => {
    const field = addField(db, tableId, 'name', 'text')
    const renamed = renameField(db, field.id, 'full_name')
    expect(renamed.name).toBe('full_name')
  })

  it('updates a field type and flags', () => {
    const field = addField(db, tableId, 'user_id', 'text')
    const updated = updateField(db, field.id, { type: 'uuid', isForeignKey: true })
    expect(updated.type).toBe('uuid')
    expect(updated.isForeignKey).toBe(true)
  })

  it('deletes a field', () => {
    const field = addField(db, tableId, 'name', 'text')
    deleteField(db, field.id)
    const second = addField(db, tableId, 'email', 'text')
    expect(second.id).not.toBe(field.id)
  })

  it('cascades field deletion when the parent table is deleted', () => {
    const field = addField(db, tableId, 'name', 'text')
    deleteTable(db, tableId)
    expect(updateField(db, field.id, { type: 'text' })).toBeUndefined()
  })
})
