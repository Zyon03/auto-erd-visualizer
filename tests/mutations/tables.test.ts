import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import {
  addTable,
  renameTable,
  updateTablePosition,
  placeTableIfAutoPositioned,
  setAutoLayoutPosition,
  setTableRole,
  deleteTable,
  getTable,
} from '../../src/mutations/tables'

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
    expect(table.autoPositioned).toBe(true)
  })

  it('never places successive tables at the same position', () => {
    const positions = Array.from({ length: 6 }, (_, i) => addTable(db, sessionId, `table_${i}`))
    const seen = new Set(positions.map((t) => `${t.positionX},${t.positionY}`))
    expect(seen.size).toBe(positions.length)
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

  it('clears autoPositioned once a table is manually moved', () => {
    const table = addTable(db, sessionId, 'users')
    const moved = updateTablePosition(db, table.id, 120, 240)
    expect(moved.autoPositioned).toBe(false)
  })

  it('placeTableIfAutoPositioned is a no-op once a table has been manually moved', () => {
    const table = addTable(db, sessionId, 'users')
    updateTablePosition(db, table.id, 120, 240)

    const result = placeTableIfAutoPositioned(db, table.id, 999, 999)
    expect(result).toBeUndefined()
    expect(getTable(db, table.id)?.positionX).toBe(120)
  })

  it('placeTableIfAutoPositioned applies while a table is still auto-positioned', () => {
    const table = addTable(db, sessionId, 'users')
    const result = placeTableIfAutoPositioned(db, table.id, 500, 500)
    expect(result?.positionX).toBe(500)
    expect(getTable(db, table.id)?.positionY).toBe(500)
  })

  it('setAutoLayoutPosition overwrites position even for a manually-moved table', () => {
    const table = addTable(db, sessionId, 'users')
    updateTablePosition(db, table.id, 120, 240)
    expect(getTable(db, table.id)?.autoPositioned).toBe(false)

    const result = setAutoLayoutPosition(db, table.id, 777, 888)
    expect(result.positionX).toBe(777)
    expect(result.positionY).toBe(888)
    expect(result.autoPositioned).toBe(true)
  })

  it('defaults roleOverride to null when no role is given', () => {
    const table = addTable(db, sessionId, 'users')
    expect(table.roleOverride).toBeNull()
  })

  it('sets roleOverride at creation when a role is given', () => {
    // The caller who already knows the answer (the AI, via mcp/erdTools.ts) can set this up
    // front instead of leaving it to the FK-presence heuristic.
    const table = addTable(db, sessionId, 'Employee', 'master')
    expect(table.roleOverride).toBe('master')
  })

  it('setTableRole pins a table role, and null clears the pin', () => {
    const table = addTable(db, sessionId, 'users')

    const pinned = setTableRole(db, table.id, 'transactional')
    expect(pinned.roleOverride).toBe('transactional')
    expect(getTable(db, table.id)?.roleOverride).toBe('transactional')

    const cleared = setTableRole(db, table.id, null)
    expect(cleared.roleOverride).toBeNull()
  })

  it('deletes a table', () => {
    const table = addTable(db, sessionId, 'users')
    deleteTable(db, table.id)
    expect(addTable(db, sessionId, 'orders').id).not.toBe(table.id)
  })

  it('gets a table by id', () => {
    const table = addTable(db, sessionId, 'users')
    const found = getTable(db, table.id)
    expect(found?.name).toBe('users')
  })

  it('returns the deleted table', () => {
    const table = addTable(db, sessionId, 'users')
    const deleted = deleteTable(db, table.id)
    expect(deleted?.name).toBe('users')
    expect(getTable(db, table.id)).toBeUndefined()
  })
})
