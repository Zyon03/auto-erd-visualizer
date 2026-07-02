/** A question the AI asks mid-conversation is persisted as a normal `chat_messages` row
 *  (role: 'assistant') whose content is this tagged JSON envelope instead of prose — avoids
 *  needing a new `role` enum value, which on SQLite would require a full table-rebuild
 *  migration for a CHECK constraint change. */
const PREFIX = '__erd_question__:'

export interface QuestionPayload {
  question: string
  choices: string[]
  allowMultiple: boolean
}

export function encodeQuestion(payload: QuestionPayload): string {
  return PREFIX + JSON.stringify(payload)
}

export function decodeQuestion(content: string): QuestionPayload | null {
  if (!content.startsWith(PREFIX)) return null
  try {
    const parsed = JSON.parse(content.slice(PREFIX.length))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.question === 'string' &&
      Array.isArray(parsed.choices) &&
      parsed.choices.every((c: unknown) => typeof c === 'string') &&
      typeof parsed.allowMultiple === 'boolean'
    ) {
      return parsed as QuestionPayload
    }
    return null
  } catch {
    return null
  }
}
