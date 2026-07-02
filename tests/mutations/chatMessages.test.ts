import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addChatMessage, listChatMessages } from '../../src/mutations/chatMessages'

describe('chat message mutations', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('adds a chat message', () => {
    const message = addChatMessage(db, sessionId, 'user', 'add a users table')
    expect(message.role).toBe('user')
    expect(message.content).toBe('add a users table')
    expect(message.sessionId).toBe(sessionId)
  })

  it('lists chat messages in insertion order', () => {
    addChatMessage(db, sessionId, 'user', 'first')
    addChatMessage(db, sessionId, 'assistant', 'second')
    addChatMessage(db, sessionId, 'system', 'third')

    const messages = listChatMessages(db, sessionId)
    expect(messages.map((m) => m.content)).toEqual(['first', 'second', 'third'])
  })

  it('only lists messages for the given session', () => {
    const otherSessionId = createSession(db, 'Other').id
    addChatMessage(db, sessionId, 'user', 'mine')
    addChatMessage(db, otherSessionId, 'user', 'theirs')

    const messages = listChatMessages(db, sessionId)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('mine')
  })
})
