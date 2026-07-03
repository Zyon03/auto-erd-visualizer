import { describe, it, expect } from 'vitest'
import { classifySpawnError, classifyFailureText } from '../../src/agent/classifyAgentError'

function enoent(): NodeJS.ErrnoException {
  const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

describe('classifySpawnError', () => {
  it('classifies ENOENT as not_installed', () => {
    expect(classifySpawnError(enoent()).kind).toBe('not_installed')
  })

  it('classifies other spawn errors as other', () => {
    const err = new Error('spawn claude EACCES') as NodeJS.ErrnoException
    err.code = 'EACCES'
    expect(classifySpawnError(err)).toEqual({ kind: 'other' })
  })
})

describe('classifyFailureText', () => {
  it.each([
    'Error: not logged in. Please run `claude login` first.',
    'Please use /login to authenticate.',
    'Invalid API key provided.',
    'Authentication failed: no credentials found.',
    'Your session has expired, please log in again.',
  ])('classifies %s as not_authenticated', (text) => {
    expect(classifyFailureText(text).kind).toBe('not_authenticated')
  })

  it('classifies unrelated failure text as other', () => {
    expect(classifyFailureText('Rate limit exceeded, try again later.')).toEqual({ kind: 'other' })
  })

  it('classifies empty text as other', () => {
    expect(classifyFailureText('')).toEqual({ kind: 'other' })
  })
})
