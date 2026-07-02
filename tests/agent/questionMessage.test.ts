import { describe, it, expect } from 'vitest'
import { encodeQuestion, decodeQuestion } from '../../src/agent/questionMessage'

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
