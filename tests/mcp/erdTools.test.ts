import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession, getSession } from '../../src/mutations/sessions'
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

  it('lets the caller pin a table role at creation instead of leaving it to the FK heuristic', () => {
    const tools = createErdTools(db, sessionId)
    // Named/shaped like it could plausibly hold a foreign key later, but the AI already knows
    // it's reference data — this is exactly the case the heuristic alone gets wrong.
    const result = tools.add_table({ name: 'Employee', role: 'master' })
    const table = result.data as { roleOverride: string | null }
    expect(table.roleOverride).toBe('master')
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

  it('updates a relationship with a nonexistent relationshipId without throwing', () => {
    const tools = createErdTools(db, sessionId)

    const result = tools.update_relationship({ relationshipId: 999999, cardinality: 'one-to-one' })

    expect(result.summary).toBe('Relationship #999999 was already gone')
    expect(result.data).toBeUndefined()
  })

  describe('rename_session', () => {
    it('renames a session that still has its default auto-generated name', () => {
      const defaultId = createSession(db, 'Session 1').id
      const tools = createErdTools(db, defaultId)

      const result = tools.rename_session({ name: 'Library System' })

      expect(result.summary).toBe('Renamed session to `Library System`')
      expect(getSession(db, defaultId)?.name).toBe('Library System')
    })

    it('trims whitespace from the given name', () => {
      const defaultId = createSession(db, 'Session 2').id
      const tools = createErdTools(db, defaultId)

      tools.rename_session({ name: '  E-commerce Store  ' })

      expect(getSession(db, defaultId)?.name).toBe('E-commerce Store')
    })

    it('refuses to overwrite a name that is not the default pattern', () => {
      const customId = createSession(db, 'My Custom System').id
      const tools = createErdTools(db, customId)

      const result = tools.rename_session({ name: 'Library System' })

      expect(result.summary).toBe('Session already has a name (`My Custom System`) — leaving it as is.')
      expect(getSession(db, customId)?.name).toBe('My Custom System')
    })

    it('does not throw for a nonexistent sessionId', () => {
      const tools = createErdTools(db, 999999)

      const result = tools.rename_session({ name: 'Library System' })

      expect(result.summary).toBe('Session #999999 was already gone')
    })
  })
})
