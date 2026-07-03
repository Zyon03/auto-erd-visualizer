import { describe, it, expect } from 'vitest'
import { getSessionEmitter, deleteSessionEmitter, publishTurnEvent } from '../../src/agent/turnEvents'

describe('turnEvents', () => {
  it('returns the same emitter instance for repeated calls with the same sessionId', () => {
    const a = getSessionEmitter(9001)
    const b = getSessionEmitter(9001)
    expect(a).toBe(b)
  })

  it('publishes events to listeners on the session emitter', () => {
    const emitter = getSessionEmitter(9002)
    const received: unknown[] = []
    emitter.on('turn-event', (event) => received.push(event))

    publishTurnEvent(9002, { type: 'turn_complete', text: 'done' })

    expect(received).toEqual([{ type: 'turn_complete', text: 'done' }])
  })

  it('drops listeners and frees the entry so a deleted session does not keep a stale emitter alive', () => {
    const before = getSessionEmitter(9003)
    const received: unknown[] = []
    before.on('turn-event', (event) => received.push(event))

    deleteSessionEmitter(9003)

    // A late event for the now-deleted session must not reach the old listener — otherwise the
    // "cleanup" would be cosmetic while the original emitter (and its listener closure) is kept
    // alive anyway.
    publishTurnEvent(9003, { type: 'turn_complete', text: 'late' })
    expect(received).toEqual([])

    const after = getSessionEmitter(9003)
    expect(after).not.toBe(before)
  })

  it('is a no-op when deleting a sessionId with no emitter', () => {
    expect(() => deleteSessionEmitter(9004)).not.toThrow()
  })
})
