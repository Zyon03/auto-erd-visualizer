export type ParsedEvent =
  | { kind: 'tool_call_started'; toolName: string }
  | { kind: 'tool_step'; toolName: string; stepText: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'ask_question'; question: string; choices: string[]; allowMultiple: boolean }
  | { kind: 'turn_result'; success: boolean; text: string }

const MCP_TOOL_PREFIX = 'mcp__erd__'
const ASK_QUESTION_TOOL = 'ask_question'

interface JsonRecord {
  [key: string]: unknown
}

export function createStreamJsonParser() {
  const pendingToolNames = new Map<string, string>()

  function parseLine(line: string): ParsedEvent[] {
    const events: ParsedEvent[] = []

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return events
    }
    if (!parsed || typeof parsed !== 'object') return events
    const evt = parsed as JsonRecord

    if (evt.type === 'assistant') {
      const content = (evt.message as JsonRecord | undefined)?.content
      if (Array.isArray(content)) {
        for (const block of content as JsonRecord[]) {
          if (block.type === 'tool_use' && typeof block.name === 'string' && typeof block.id === 'string') {
            if (block.name.startsWith(MCP_TOOL_PREFIX)) {
              const toolName = block.name.slice(MCP_TOOL_PREFIX.length)
              if (toolName === ASK_QUESTION_TOOL) {
                // Everything the frontend needs is already in this call's own input — no need
                // to wait for the (trivial) tool_result round-trip, so this never goes into
                // pendingToolNames and its later tool_result is harmlessly ignored below.
                const input = block.input as JsonRecord | undefined
                const question = typeof input?.question === 'string' ? input.question : ''
                const choices = Array.isArray(input?.choices)
                  ? (input!.choices as unknown[]).filter((c): c is string => typeof c === 'string')
                  : []
                const allowMultiple = input?.allowMultiple === true
                if (question) events.push({ kind: 'ask_question', question, choices, allowMultiple })
              } else {
                pendingToolNames.set(block.id, toolName)
                events.push({ kind: 'tool_call_started', toolName })
              }
            }
          } else if (block.type === 'text' && typeof block.text === 'string') {
            events.push({ kind: 'assistant_text', text: block.text })
          }
        }
      }
    }

    if (evt.type === 'user') {
      const content = (evt.message as JsonRecord | undefined)?.content
      if (Array.isArray(content)) {
        for (const block of content as JsonRecord[]) {
          if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
            const toolName = pendingToolNames.get(block.tool_use_id)
            if (!toolName) continue
            pendingToolNames.delete(block.tool_use_id)

            // get_schema's real MCP result is the full schema JSON -- the AI needs that to see
            // current state, but every other tool's result is already a short human-readable
            // summary (see mcp/server.ts), so this is the one case where echoing the raw result
            // text as the step line would dump an enormous JSON blob into the chat log instead.
            if (toolName === 'get_schema') {
              events.push({ kind: 'tool_step', toolName, stepText: 'Checked the current schema' })
              continue
            }

            const resultContent = block.content
            const stepText = Array.isArray(resultContent)
              ? (resultContent as JsonRecord[])
                  .filter((c) => c.type === 'text' && typeof c.text === 'string')
                  .map((c) => c.text as string)
                  .join(' ')
              : ''
            events.push({ kind: 'tool_step', toolName, stepText })
          }
        }
      }
    }

    if (evt.type === 'result') {
      const isError = evt.is_error === true || evt.subtype !== 'success'
      const text = typeof evt.result === 'string' ? evt.result : ''
      events.push({ kind: 'turn_result', success: !isError, text })
    }

    return events
  }

  return { parseLine }
}
