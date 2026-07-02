import { describe, it, expect, beforeEach } from 'vitest'
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
})
