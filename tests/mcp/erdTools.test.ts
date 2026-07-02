import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { createErdTools } from '../../src/mcp/erdTools'

describe('createErdTools', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('adds a table and returns a human-readable summary', () => {
    const tools = createErdTools(db, sessionId)
    const result = tools.add_table({ name: 'users' })
    expect(result.summary).toBe('Added table `users`')
  })

  it('adds a field to a table', () => {
    const tools = createErdTools(db, sessionId)
    const table = tools.add_table({ name: 'users' }).data as { id: number }
    const result = tools.add_field({ tableId: table.id, name: 'email', type: 'text' })
    expect(result.summary).toBe('Added field `email` (text)')
  })

  it('adds a relationship between two fields', () => {
    const tools = createErdTools(db, sessionId)
    const users = tools.add_table({ name: 'users' }).data as { id: number }
    const orders = tools.add_table({ name: 'orders' }).data as { id: number }
    const userId = tools.add_field({ tableId: users.id, name: 'id', type: 'uuid', isPrimaryKey: true }).data as { id: number }
    const orderUserId = tools.add_field({ tableId: orders.id, name: 'user_id', type: 'uuid', isForeignKey: true }).data as { id: number }

    const result = tools.add_relationship({
      fromFieldId: userId.id,
      toFieldId: orderUserId.id,
      cardinality: 'one-to-many',
      aiComment: 'A user has many orders',
    })
    expect(result.summary).toBe('Linked fields with a one-to-many relationship')
  })

  it('gets the full schema', () => {
    const tools = createErdTools(db, sessionId)
    tools.add_table({ name: 'users' })
    const result = tools.get_schema()
    const data = result.data as { tables: unknown[] }
    expect(data.tables).toHaveLength(1)
  })

  it('deletes a relationship', () => {
    const tools = createErdTools(db, sessionId)
    const users = tools.add_table({ name: 'users' }).data as { id: number }
    const orders = tools.add_table({ name: 'orders' }).data as { id: number }
    const userId = tools.add_field({ tableId: users.id, name: 'id', type: 'uuid', isPrimaryKey: true }).data as { id: number }
    const orderUserId = tools.add_field({ tableId: orders.id, name: 'user_id', type: 'uuid', isForeignKey: true }).data as { id: number }
    const rel = tools.add_relationship({ fromFieldId: userId.id, toFieldId: orderUserId.id, cardinality: 'one-to-many' }).data as { id: number }

    const result = tools.delete_relationship({ relationshipId: rel.id })
    expect(result.summary).toBe(`Deleted relationship #${rel.id}`)
  })
})
