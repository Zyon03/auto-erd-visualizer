import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable, renameTable, updateTablePosition, deleteTable } from '../../src/mutations/tables'

describe('table mutations', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('adds a table with default position', () => {
    const table = addTable(db, sessionId, 'users')
    expect(table.name).toBe('users')
    expect(table.positionX).toBe(0)
    expect(table.positionY).toBe(0)
  })

  it('renames a table', () => {
    const table = addTable(db, sessionId, 'users')
    const renamed = renameTable(db, table.id, 'M_Users')
    expect(renamed.name).toBe('M_Users')
    expect(renamed.id).toBe(table.id)
  })

  it('updates a table position', () => {
    const table = addTable(db, sessionId, 'users')
    const moved = updateTablePosition(db, table.id, 120, 240)
    expect(moved.positionX).toBe(120)
    expect(moved.positionY).toBe(240)
  })

  it('deletes a table', () => {
    const table = addTable(db, sessionId, 'users')
    deleteTable(db, table.id)
    expect(addTable(db, sessionId, 'orders').id).not.toBe(table.id)
  })
})
