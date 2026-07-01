import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship } from '../../src/mutations/relationships'
import { getFullSchema } from '../../src/mutations/getFullSchema'

describe('getFullSchema', () => {
  it('returns tables with nested, ordered fields and session relationships', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const users = addTable(db, sessionId, 'users')
    const orders = addTable(db, sessionId, 'orders')
    const userIdField = addField(db, users.id, 'id', 'uuid', true)
    addField(db, users.id, 'name', 'text')
    const orderUserIdField = addField(db, orders.id, 'user_id', 'uuid', false, true)
    addRelationship(db, sessionId, userIdField.id, orderUserIdField.id, 'one-to-many', 'A user has many orders')

    const schema = getFullSchema(db, sessionId)

    expect(schema.tables).toHaveLength(2)
    const usersTable = schema.tables.find((t) => t.name === 'users')
    expect(usersTable?.fields.map((f) => f.name)).toEqual(['id', 'name'])
    expect(schema.relationships).toHaveLength(1)
    expect(schema.relationships[0].aiComment).toBe('A user has many orders')
  })
})
