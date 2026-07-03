import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable, setTableRole } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { getFullSchema } from '../../src/mutations/getFullSchema'
import { classifyTableRole } from '../../src/mutations/tableRole'

describe('classifyTableRole', () => {
  it('classifies a table with no foreign-key fields as master', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const table = addTable(db, sessionId, 'Product')
    addField(db, table.id, 'id', 'uuid', true)
    addField(db, table.id, 'name', 'varchar')

    const schemaData = getFullSchema(db, sessionId)
    expect(classifyTableRole(schemaData.tables[0])).toBe('master')
  })

  it('classifies a table with at least one foreign-key field as transactional, regardless of naming', () => {
    // Named without the M_/T_ convention on purpose, to prove this reads field flags, not names.
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const table = addTable(db, sessionId, 'Widget')
    addField(db, table.id, 'id', 'uuid', true)
    addField(db, table.id, 'owner_id', 'uuid', false, true)

    const schemaData = getFullSchema(db, sessionId)
    expect(classifyTableRole(schemaData.tables[0])).toBe('transactional')
  })

  it('classifies a table with no fields yet as master', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    addTable(db, sessionId, 'Empty')

    const schemaData = getFullSchema(db, sessionId)
    expect(classifyTableRole(schemaData.tables[0])).toBe('master')
  })

  it('lets a manual roleOverride win over the inferred value in either direction', () => {
    const db = createDb(':memory:')
    const sessionId = createSession(db, 'Session').id
    const master = addTable(db, sessionId, 'Product')
    addField(db, master.id, 'id', 'uuid', true)
    const transactional = addTable(db, sessionId, 'Order')
    addField(db, transactional.id, 'product_id', 'uuid', false, true)

    setTableRole(db, master.id, 'transactional')
    setTableRole(db, transactional.id, 'master')

    const schemaData = getFullSchema(db, sessionId)
    const pinnedMaster = schemaData.tables.find((t) => t.id === master.id)!
    const pinnedTransactional = schemaData.tables.find((t) => t.id === transactional.id)!

    expect(classifyTableRole(pinnedMaster)).toBe('transactional')
    expect(classifyTableRole(pinnedTransactional)).toBe('master')
  })
})
