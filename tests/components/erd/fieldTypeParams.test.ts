import { describe, it, expect } from 'vitest'
import { parseFieldType, formatFieldType, TYPES_WITH_LENGTH, TYPES_WITH_PRECISION } from '../../../src/components/erd/fieldTypeParams'

describe('parseFieldType', () => {
  it('splits a single-param type into base and params', () => {
    expect(parseFieldType('varchar(255)')).toEqual({ base: 'varchar', params: ['255'] })
  })

  it('splits a two-param type into base and both params', () => {
    expect(parseFieldType('decimal(10,2)')).toEqual({ base: 'decimal', params: ['10', '2'] })
  })

  it('trims whitespace around params', () => {
    expect(parseFieldType('decimal(10, 2)')).toEqual({ base: 'decimal', params: ['10', '2'] })
  })

  it('returns an empty params array for a type with no parentheses', () => {
    expect(parseFieldType('int')).toEqual({ base: 'int', params: [] })
  })

  it('returns an empty params array for empty parentheses', () => {
    expect(parseFieldType('varchar()')).toEqual({ base: 'varchar', params: [] })
  })

  it('treats an unparseable string as its own base with no params', () => {
    expect(parseFieldType('not a type()')).toEqual({ base: 'not a type()', params: [] })
  })
})

describe('formatFieldType', () => {
  it('joins a single param onto the base in parentheses', () => {
    expect(formatFieldType('varchar', ['255'])).toBe('varchar(255)')
  })

  it('joins two params with a comma', () => {
    expect(formatFieldType('decimal', ['10', '2'])).toBe('decimal(10,2)')
  })

  it('omits parentheses entirely when there are no params', () => {
    expect(formatFieldType('int', [])).toBe('int')
  })

  it('drops empty/whitespace-only params rather than emitting a blank slot', () => {
    expect(formatFieldType('varchar', [''])).toBe('varchar')
    expect(formatFieldType('decimal', ['10', ''])).toBe('decimal(10)')
  })

  it('round-trips through parseFieldType', () => {
    const original = 'decimal(10,2)'
    const { base, params } = parseFieldType(original)
    expect(formatFieldType(base, params)).toBe(original)
  })
})

describe('TYPES_WITH_LENGTH / TYPES_WITH_PRECISION', () => {
  it('includes varchar and char as length types, not precision types', () => {
    expect(TYPES_WITH_LENGTH).toContain('varchar')
    expect(TYPES_WITH_LENGTH).toContain('char')
    expect(TYPES_WITH_PRECISION).not.toContain('varchar')
  })

  it('includes decimal and float as precision types, not length types', () => {
    expect(TYPES_WITH_PRECISION).toContain('decimal')
    expect(TYPES_WITH_PRECISION).toContain('float')
    expect(TYPES_WITH_LENGTH).not.toContain('decimal')
  })

  it('excludes int/bigint from both -- a display width is vestigial, not a real constraint', () => {
    expect(TYPES_WITH_LENGTH).not.toContain('int')
    expect(TYPES_WITH_LENGTH).not.toContain('bigint')
    expect(TYPES_WITH_PRECISION).not.toContain('int')
    expect(TYPES_WITH_PRECISION).not.toContain('bigint')
  })

  it('excludes types where a length/precision makes no sense at all', () => {
    for (const type of ['boolean', 'timestamp', 'date', 'uuid', 'json', 'blob']) {
      expect(TYPES_WITH_LENGTH).not.toContain(type)
      expect(TYPES_WITH_PRECISION).not.toContain(type)
    }
  })
})
