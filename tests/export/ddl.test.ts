import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship } from '../../src/mutations/relationships'
import { generateDdl } from '../../src/export/ddl'

describe('generateDdl', () => {
  it('emits CREATE TABLE and ALTER TABLE foreign key statements', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const users = addTable(db, sessionId, 'users')
    const orders = addTable(db, sessionId, 'orders')
    const userIdField = addField(db, users.id, 'id', 'uuid', true)
    addField(db, users.id, 'name', 'text')
    const orderUserIdField = addField(db, orders.id, 'user_id', 'uuid', false, true)
    addRelationship(db, sessionId, userIdField.id, orderUserIdField.id, 'one-to-many')

    const ddl = generateDdl(db, sessionId)

    expect(ddl).toContain('CREATE TABLE users (')
    expect(ddl).toContain('id uuid PRIMARY KEY')
    expect(ddl).toContain('CREATE TABLE orders (')
    expect(ddl).toContain('ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users(id);')
  })
})
