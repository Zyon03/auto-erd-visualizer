import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/db/client'
import { sessions } from '../../src/db/schema'

describe('createDb', () => {
  it('creates a queryable in-memory database matching the schema', () => {
    const db = createDb(':memory:')
    db.insert(sessions).values({ name: 'Test Session' }).run()
    const rows = db.select().from(sessions).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Test Session')
  })
})
