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

  it('round-trips an "other" payload with no hint -- the generic/unclassified failure case', () => {
    // This used to be rejected on decode (kind was restricted to the two actionable ones), which
    // meant a generic failure -- a timeout, a non-zero exit code -- fell back to an undecodable
    // plain string and silently disappeared behind the chat panel's activity-log toggle instead
    // of showing as an error. Every kind must round-trip now so every failure stays visible.
    const payload = { kind: 'other' as const, message: 'The AI process exited unexpectedly (code 1).' }
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
      decodeAgentError('__erd_agent_error__:' + JSON.stringify({ kind: 'bogus', message: 'x', hint: 'y' })),
    ).toBeNull()
  })

  it('returns null for well-formed JSON missing required fields', () => {
    expect(decodeAgentError('__erd_agent_error__:' + JSON.stringify({ kind: 'not_installed' }))).toBeNull()
  })
})
