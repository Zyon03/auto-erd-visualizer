import { describe, it, expect } from 'vitest'
import { resolveTurnMessage } from '../../src/agent/resolveTurnMessage'
import type { ChatMessage } from '../../src/mutations/chatMessages'

function msg(role: ChatMessage['role'], content: string, id: number): ChatMessage {
  return { id, sessionId: 1, role, content, createdAt: '' }
}

describe('resolveTurnMessage', () => {
  it('returns the user message unchanged when there are no pending system notes', () => {
    const prior: ChatMessage[] = [msg('user', 'add users table', 1), msg('assistant', 'Added.', 2)]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe('now add orders')
  })

  it('prepends system notes added since the last user/assistant message', () => {
    const prior: ChatMessage[] = [
      msg('user', 'add users table', 1),
      msg('assistant', 'Added.', 2),
      msg('system', "Table `users` renamed to `M_Users`", 3),
    ]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe(
      "[Table `users` renamed to `M_Users`]\n\nnow add orders",
    )
  })

  it('prepends multiple pending system notes in order', () => {
    const prior: ChatMessage[] = [
      msg('assistant', 'Added.', 1),
      msg('system', 'note one', 2),
      msg('system', 'note two', 3),
    ]
    expect(resolveTurnMessage(prior, 'continue')).toBe('[note one]\n[note two]\n\ncontinue')
  })

  it('ignores system notes from before the last user/assistant message', () => {
    const prior: ChatMessage[] = [
      msg('system', 'stale note', 1),
      msg('user', 'add users table', 2),
      msg('assistant', 'Added.', 3),
    ]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe('now add orders')
  })

  it('handles an empty prior message list', () => {
    expect(resolveTurnMessage([], 'start here')).toBe('start here')
  })
})
