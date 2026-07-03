import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addChatMessage, listChatMessages, listChatMessagesPage } from '../../src/mutations/chatMessages'

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

describe('listChatMessagesPage', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('returns the most recent `limit` messages, oldest-first — not the oldest `limit`', () => {
    for (let i = 1; i <= 10; i++) addChatMessage(db, sessionId, 'user', `msg ${i}`)

    const page = listChatMessagesPage(db, sessionId, { limit: 3 })

    // The most recent 3 are 8, 9, 10 — displayed oldest-first, not the first 3 ever sent.
    expect(page.messages.map((m) => m.content)).toEqual(['msg 8', 'msg 9', 'msg 10'])
  })

  it('reports hasMore when older messages remain beyond the page', () => {
    for (let i = 1; i <= 10; i++) addChatMessage(db, sessionId, 'user', `msg ${i}`)

    expect(listChatMessagesPage(db, sessionId, { limit: 3 }).hasMore).toBe(true)
  })

  it('reports hasMore=false when the page covers exactly all remaining messages', () => {
    for (let i = 1; i <= 3; i++) addChatMessage(db, sessionId, 'user', `msg ${i}`)

    const exact = listChatMessagesPage(db, sessionId, { limit: 3 })
    expect(exact.hasMore).toBe(false)
    expect(exact.messages).toHaveLength(3)
  })

  it('reports hasMore=false when the page has room to spare', () => {
    for (let i = 1; i <= 2; i++) addChatMessage(db, sessionId, 'user', `msg ${i}`)

    const page = listChatMessagesPage(db, sessionId, { limit: 5 })
    expect(page.hasMore).toBe(false)
    expect(page.messages).toHaveLength(2)
  })

  it('beforeId returns the page immediately older than that message, oldest-first', () => {
    for (let i = 1; i <= 10; i++) addChatMessage(db, sessionId, 'user', `msg ${i}`)

    // First page: the most recent 3 (msg 8, 9, 10).
    const firstPage = listChatMessagesPage(db, sessionId, { limit: 3 })
    expect(firstPage.messages.map((m) => m.content)).toEqual(['msg 8', 'msg 9', 'msg 10'])

    // Load the page before the oldest message currently shown (msg 8).
    const olderPage = listChatMessagesPage(db, sessionId, { limit: 3, beforeId: firstPage.messages[0].id })
    expect(olderPage.messages.map((m) => m.content)).toEqual(['msg 5', 'msg 6', 'msg 7'])
    expect(olderPage.hasMore).toBe(true)

    // Keep paging back to the very start.
    const oldestPage = listChatMessagesPage(db, sessionId, { limit: 3, beforeId: olderPage.messages[0].id })
    expect(oldestPage.messages.map((m) => m.content)).toEqual(['msg 2', 'msg 3', 'msg 4'])
    expect(oldestPage.hasMore).toBe(true)

    const finalPage = listChatMessagesPage(db, sessionId, { limit: 3, beforeId: oldestPage.messages[0].id })
    expect(finalPage.messages.map((m) => m.content)).toEqual(['msg 1'])
    expect(finalPage.hasMore).toBe(false)
  })

  it('only pages messages for the given session', () => {
    const otherSessionId = createSession(db, 'Other').id
    addChatMessage(db, sessionId, 'user', 'mine')
    addChatMessage(db, otherSessionId, 'user', 'theirs')

    const page = listChatMessagesPage(db, sessionId, { limit: 10 })
    expect(page.messages).toHaveLength(1)
    expect(page.messages[0].content).toBe('mine')
  })
})
