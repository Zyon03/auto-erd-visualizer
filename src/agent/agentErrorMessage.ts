/** A classified agent-process error (CLI not installed / not logged in) is persisted as a
 *  normal `chat_messages` row (role: 'system') whose content is this tagged JSON envelope
 *  instead of plain text — same reasoning as questionMessage.ts: avoids needing a new `role`
 *  enum value, which on SQLite would require a full table-rebuild migration. */
const PREFIX = "__erd_agent_error__:"

export type ActionableAgentErrorKind = "not_installed" | "not_authenticated"

export interface AgentErrorPayload {
  kind: ActionableAgentErrorKind
  message: string
  hint: string
}

export function encodeAgentError(payload: AgentErrorPayload): string {
  return PREFIX + JSON.stringify(payload)
}

export function decodeAgentError(content: string): AgentErrorPayload | null {
  if (!content.startsWith(PREFIX)) return null
  try {
    const parsed = JSON.parse(content.slice(PREFIX.length))
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed.kind === "not_installed" || parsed.kind === "not_authenticated") &&
      typeof parsed.message === "string" &&
      typeof parsed.hint === "string"
    ) {
      return parsed as AgentErrorPayload
    }
    return null
  } catch {
    return null
  }
}
