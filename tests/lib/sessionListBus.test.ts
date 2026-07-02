import { describe, it, expect, vi } from 'vitest'
import { notifySessionsChanged, onSessionsChanged } from '../../src/lib/sessionListBus'

describe('sessionListBus', () => {
  it('notifies subscribed handlers', () => {
    const handler = vi.fn()
    onSessionsChanged(handler)

    notifySessionsChanged()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribing', () => {
    const handler = vi.fn()
    const unsubscribe = onSessionsChanged(handler)
    unsubscribe()

    notifySessionsChanged()

    expect(handler).not.toHaveBeenCalled()
  })
})
