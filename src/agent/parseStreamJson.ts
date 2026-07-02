export type ParsedEvent =
  | { kind: 'tool_step'; toolName: string; stepText: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'turn_result'; success: boolean; text: string }

const MCP_TOOL_PREFIX = 'mcp__erd__'

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
              pendingToolNames.set(block.id, block.name.slice(MCP_TOOL_PREFIX.length))
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
