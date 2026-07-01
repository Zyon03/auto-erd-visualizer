import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession, listSessions, getSession } from '../../src/mutations/sessions'

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
})
