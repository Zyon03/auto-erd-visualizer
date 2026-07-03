import { describe, it, expect } from 'vitest'
import { encodeAgentError, decodeAgentError } from '../../src/agent/agentErrorMessage'

describe('agentErrorMessage', () => {
  it('round-trips a not_installed payload', () => {
    const payload = { kind: 'not_installed' as const, message: "Couldn't find the Claude Code CLI.", hint: 'Install it.' }
    expect(decodeAgentError(encodeAgentError(payload))).toEqual(payload)
  })

  it('round-trips a not_authenticated payload', () => {
    const payload = { kind: 'not_authenticated' as const, message: "Not logged in.", hint: 'Run `claude` and log in.' }
    expect(decodeAgentError(encodeAgentError(payload))).toEqual(payload)
  })

  it('returns null for ordinary prose', () => {
    expect(decodeAgentError('The AI process exited unexpectedly (code 1).')).toBeNull()
  })

  it('returns null for malformed JSON after the marker', () => {
    expect(decodeAgentError('__erd_agent_error__:{not valid json')).toBeNull()
  })

  it('returns null for well-formed JSON with an invalid kind', () => {
    expect(
      decodeAgentError('__erd_agent_error__:' + JSON.stringify({ kind: 'other', message: 'x', hint: 'y' })),
    ).toBeNull()
  })

  it('returns null for well-formed JSON missing required fields', () => {
    expect(decodeAgentError('__erd_agent_error__:' + JSON.stringify({ kind: 'not_installed' }))).toBeNull()
  })
})
