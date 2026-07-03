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

export interface PendingQuestion extends QuestionPayload {
  messageId: number
}

/** Finds the question still awaiting a reply, scanning from the most recent message backward.
 *  Hitting a `user` message first means the latest AI activity already got a reply -- nothing
 *  pending. Hitting a question-shaped `assistant` message first means it's pending, regardless
 *  of what non-question assistant text came after it (the AI is free to add closing prose once
 *  it's asked -- that isn't a reply from the user, so it must not bury the question). This is
 *  intentionally derived from the message log itself rather than tracked as separate state, so
 *  it self-clears the instant a reply is appended and survives a page reload mid-question. */
export function findPendingQuestion(
  messages: Array<{ id: number; role: 'user' | 'assistant' | 'system'; content: string }>,
): PendingQuestion | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'user') return null
    if (message.role === 'assistant') {
      const question = decodeQuestion(message.content)
      if (question) return { ...question, messageId: message.id }
    }
    // System notices and non-question assistant text (e.g. closing prose tacked on after
    // ask_question, or an ordinary reply from a turn that never asked anything) don't resolve
    // the search either way -- keep scanning backward for a question that's still unanswered.
  }
  return null
}
