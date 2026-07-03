import { describe, it, expect } from 'vitest'
import { encodeQuestion, decodeQuestion, findPendingQuestion } from '../../src/agent/questionMessage'

describe('questionMessage', () => {
  it('round-trips a question through encode/decode', () => {
    const payload = { question: 'Should orders support partial refunds?', choices: ['Yes', 'No'], allowMultiple: false }
    expect(decodeQuestion(encodeQuestion(payload))).toEqual(payload)
  })

  it('round-trips a question with no choices (open-ended)', () => {
    const payload = { question: 'What should happen when a user deletes their account?', choices: [], allowMultiple: false }
    expect(decodeQuestion(encodeQuestion(payload))).toEqual(payload)
  })

  it('returns null for ordinary prose', () => {
    expect(decodeQuestion('A user can place multiple orders.')).toBeNull()
  })

  it('returns null for malformed JSON after the marker', () => {
    expect(decodeQuestion('__erd_question__:{not valid json')).toBeNull()
  })

  it('returns null for well-formed JSON missing required fields', () => {
    expect(decodeQuestion('__erd_question__:' + JSON.stringify({ question: 'Hi' }))).toBeNull()
  })
})

describe('findPendingQuestion', () => {
  const payload = { question: 'Soft delete users?', choices: ['Yes', 'No'], allowMultiple: false }
  const questionMessage = { id: 1, role: 'assistant' as const, content: encodeQuestion(payload) }

  it('returns null for an empty message log', () => {
    expect(findPendingQuestion([])).toBeNull()
  })

  it('returns null when the last message is ordinary assistant prose', () => {
    expect(findPendingQuestion([{ id: 1, role: 'assistant', content: 'A user can place multiple orders.' }])).toBeNull()
  })

  it('is pending when the question is the last message', () => {
    expect(findPendingQuestion([questionMessage])).toEqual({ ...payload, messageId: 1 })
  })

  it('stays pending through trailing assistant prose after the question (the regression case)', () => {
    const trailingText = { id: 2, role: 'assistant' as const, content: 'Let me know what you think!' }
    expect(findPendingQuestion([questionMessage, trailingText])).toEqual({ ...payload, messageId: 1 })
  })

  it('stays pending through trailing system tool-step/error messages', () => {
    const systemNote = { id: 2, role: 'system' as const, content: 'Checked the current schema' }
    expect(findPendingQuestion([questionMessage, systemNote])).toEqual({ ...payload, messageId: 1 })
  })

  it('resolves once the user replies, even after trailing assistant prose', () => {
    const trailingText = { id: 2, role: 'assistant' as const, content: 'Let me know what you think!' }
    const reply = { id: 3, role: 'user' as const, content: 'Yes' }
    expect(findPendingQuestion([questionMessage, trailingText, reply])).toBeNull()
  })

  it('only reports the most recent question when multiple were asked and replied to in sequence', () => {
    const reply = { id: 2, role: 'user' as const, content: 'Yes' }
    const secondPayload = { question: 'Audit trail too?', choices: ['Yes', 'No'], allowMultiple: false }
    const secondQuestion = { id: 3, role: 'assistant' as const, content: encodeQuestion(secondPayload) }
    expect(findPendingQuestion([questionMessage, reply, secondQuestion])).toEqual({ ...secondPayload, messageId: 3 })
  })
})
