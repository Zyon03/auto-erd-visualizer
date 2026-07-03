import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../../src/db/client'
import {
  createSession,
  listSessions,
  getSession,
  setClaudeSessionId,
  clearClaudeSessionId,
  renameSession,
  deleteSession,
  setSessionModel,
} from '../../src/mutations/sessions'
import { addTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship } from '../../src/mutations/relationships'
import { addChatMessage } from '../../src/mutations/chatMessages'
import { fields, relationships, chatMessages, tables } from '../../src/db/schema'

describe('session mutations', () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb(':memory:')
  })

  it('creates a session', () => {
    const session = createSession(db, 'My ERD')
    expect(session.id).toBeGreaterThan(0)
    expect(session.name).toBe('My ERD')
  })

  it('lists sessions with a table count', () => {
    createSession(db, 'Session A')
    const list = listSessions(db)
    expect(list).toHaveLength(1)
    expect(list[0].tableCount).toBe(0)
  })

  it('reports the correct table count for sessions that actually have tables', () => {
    // Two sessions on purpose: a naive correlated subquery keyed on an unqualified "id" column
    // can accidentally resolve to tables.id instead of sessions.id, which happens to still give
    // the right answer for the very first session/table pair (both id 1) — a second session,
    // whose table ids don't coincidentally match its own session id, catches that.
    const sessionA = createSession(db, 'Session A')
    addTable(db, sessionA.id, 'users')
    addTable(db, sessionA.id, 'orders')
    addTable(db, sessionA.id, 'reviews')
    const sessionB = createSession(db, 'Session B')
    addTable(db, sessionB.id, 'products')

    const list = listSessions(db)
    expect(list.find((s) => s.id === sessionA.id)?.tableCount).toBe(3)
    expect(list.find((s) => s.id === sessionB.id)?.tableCount).toBe(1)
  })

  it('gets a session by id', () => {
    const created = createSession(db, 'Session B')
    const found = getSession(db, created.id)
    expect(found?.name).toBe('Session B')
  })

  it('returns undefined for a missing session', () => {
    expect(getSession(db, 999)).toBeUndefined()
  })

  it('sets and clears the claude session id', () => {
    const session = createSession(db, 'Session C')
    expect(session.claudeSessionId).toBeNull()

    const withId = setClaudeSessionId(db, session.id, 'abc-123')
    expect(withId.claudeSessionId).toBe('abc-123')

    const cleared = clearClaudeSessionId(db, session.id)
    expect(cleared.claudeSessionId).toBeNull()
  })

  it('renames a session', () => {
    const session = createSession(db, 'Session D')
    const renamed = renameSession(db, session.id, 'Renamed')
    expect(renamed.name).toBe('Renamed')
    expect(renamed.id).toBe(session.id)
  })

  it('sets and clears the model override', () => {
    const session = createSession(db, 'Session F')
    expect(session.model).toBeNull()

    const withModel = setSessionModel(db, session.id, 'opus')
    expect(withModel.model).toBe('opus')

    const cleared = setSessionModel(db, session.id, null)
    expect(cleared.model).toBeNull()
  })

  it('deletes a session and cascades its tables', () => {
    const session = createSession(db, 'Session E')
    addTable(db, session.id, 'users')

    const deleted = deleteSession(db, session.id)
    expect(deleted?.name).toBe('Session E')
    expect(getSession(db, session.id)).toBeUndefined()
    expect(listSessions(db)).toHaveLength(0)
  })

  it('really deletes every row a session owns, not just the session row', () => {
    const session = createSession(db, 'Session G')
    const usersTable = addTable(db, session.id, 'users')
    const ordersTable = addTable(db, session.id, 'orders')
    const userIdField = addField(db, usersTable.id, 'id', 'uuid', true)
    const orderUserIdField = addField(db, ordersTable.id, 'user_id', 'uuid', false, true)
    addRelationship(db, session.id, userIdField.id, orderUserIdField.id, 'one-to-many')
    addChatMessage(db, session.id, 'user', 'Users can place many orders')

    deleteSession(db, session.id)

    expect(db.select().from(tables).where(eq(tables.sessionId, session.id)).all()).toHaveLength(0)
    expect(db.select().from(fields).all()).toHaveLength(0)
    expect(db.select().from(relationships).where(eq(relationships.sessionId, session.id)).all()).toHaveLength(0)
    expect(db.select().from(chatMessages).where(eq(chatMessages.sessionId, session.id)).all()).toHaveLength(0)
  })
})
