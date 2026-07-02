import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable, updateTablePosition, getTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship, updateRelationship, deleteRelationship } from '../../src/mutations/relationships'

describe('relationship mutations', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number
  let usersTableId: number
  let ordersTableId: number
  let userIdField: number
  let orderUserIdField: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
    const users = addTable(db, sessionId, 'users')
    const orders = addTable(db, sessionId, 'orders')
    usersTableId = users.id
    ordersTableId = orders.id
    userIdField = addField(db, users.id, 'id', 'uuid', true).id
    orderUserIdField = addField(db, orders.id, 'user_id', 'uuid', false, true).id
  })

  it('adds a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many', 'A user has many orders')
    expect(rel.cardinality).toBe('one-to-many')
    expect(rel.aiComment).toBe('A user has many orders')
  })

  it('updates a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    const updated = updateRelationship(db, rel.id, { aiComment: 'Updated comment' })
    expect(updated?.aiComment).toBe('Updated comment')
  })

  it('deletes a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    deleteRelationship(db, rel.id)
    expect(updateRelationship(db, rel.id, { aiComment: 'x' })).toBeUndefined()
  })

  it('rejects a relationship from a field to itself', () => {
    expect(() => addRelationship(db, sessionId, userIdField, userIdField, 'one-to-many')).toThrow()
  })

  it('rejects a duplicate relationship between the same two fields', () => {
    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    expect(() => addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')).toThrow()
  })

  it('rejects a duplicate relationship in the reverse direction', () => {
    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    expect(() => addRelationship(db, sessionId, orderUserIdField, userIdField, 'one-to-many')).toThrow()
  })

  it('allows a self-referencing relationship between two different fields on the same table', () => {
    const managerIdField = addField(db, usersTableId, 'manager_id', 'uuid', false, true).id
    expect(() => addRelationship(db, sessionId, userIdField, managerIdField, 'one-to-many')).not.toThrow()
  })

  it('moves the FK-holding table near the table it references', () => {
    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')

    const users = getTable(db, usersTableId)!
    const orders = getTable(db, ordersTableId)!
    const distance = Math.hypot(orders.positionX - users.positionX, orders.positionY - users.positionY)
    expect(distance).toBeLessThan(400)
  })

  it('does not move a table that has already been manually positioned', () => {
    updateTablePosition(db, ordersTableId, 900, 900)

    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')

    const orders = getTable(db, ordersTableId)!
    expect(orders.positionX).toBe(900)
    expect(orders.positionY).toBe(900)
  })
})
