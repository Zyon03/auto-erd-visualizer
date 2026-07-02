import { describe, it, expect } from 'vitest'
import { createStreamJsonParser } from '../../src/agent/parseStreamJson'

describe('createStreamJsonParser', () => {
  it('ignores non-erd tool calls (e.g. ToolSearch) and their results', () => {
    const parser = createStreamJsonParser()
    const toolUseLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'ToolSearch', input: { query: 'select:mcp__erd__add_table' } }] },
    })
    const toolResultLine = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'tool_reference', tool_name: 'mcp__erd__add_table' }] }] },
    })

    expect(parser.parseLine(toolUseLine)).toEqual([])
    expect(parser.parseLine(toolResultLine)).toEqual([])
  })

  it('emits a tool_step for an erd tool call, using the tool result text as the step text', () => {
    const parser = createStreamJsonParser()
    const toolUseLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'mcp__erd__add_table', input: { name: 'ping_test' } }] },
    })
    const toolResultLine = JSON.stringify({
      type: 'user',
      message: { content: [{ tool_use_id: 'toolu_2', type: 'tool_result', content: [{ type: 'text', text: 'Added table ping_test with id 7' }] }] },
    })

    expect(parser.parseLine(toolUseLine)).toEqual([])
    expect(parser.parseLine(toolResultLine)).toEqual([
      { kind: 'tool_step', toolName: 'add_table', stepText: 'Added table ping_test with id 7' },
    ])
  })

  it('emits assistant_text for a plain text message', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } })

    expect(parser.parseLine(line)).toEqual([{ kind: 'assistant_text', text: 'Done.' }])
  })

  it('emits a successful turn_result from a success result event', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' })

    expect(parser.parseLine(line)).toEqual([{ kind: 'turn_result', success: true, text: 'Done.' }])
  })

  it('emits a failed turn_result when is_error is true', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' })

    expect(parser.parseLine(line)).toEqual([{ kind: 'turn_result', success: false, text: 'boom' }])
  })

  it('ignores malformed JSON lines', () => {
    const parser = createStreamJsonParser()
    expect(parser.parseLine('not json')).toEqual([])
  })

  it('ignores system events like hook notifications', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup' })
    expect(parser.parseLine(line)).toEqual([])
  })
})
