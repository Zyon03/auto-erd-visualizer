import type { AgentErrorKind } from "./classifyAgentError"

/** Every turn_error (not just the actionable "not installed"/"not logged in" cases) is persisted
 *  as a normal `chat_messages` row (role: 'system') whose content is this tagged JSON envelope
 *  instead of plain text — same reasoning as questionMessage.ts: avoids needing a new `role`
 *  enum value, which on SQLite would require a full table-rebuild migration.
 *
 *  This used to only cover the two actionable kinds, falling back to a plain (undecodable)
 *  string for a generic/"other" failure -- e.g. a timeout or a non-zero exit code. Since the chat
 *  panel hides plain system messages by default (they normally are just tool-step activity log
 *  entries), that meant a genuine turn failure could silently disappear behind the activity-log
 *  toggle: the "thinking" indicator would stop with nothing visible in the conversation at all,
 *  reading as the AI having quietly given up rather than having actually failed. Every kind is
 *  tagged now so every failure stays visible regardless of that toggle. */
const PREFIX = "__erd_agent_error__:"

export interface AgentErrorPayload {
  kind: AgentErrorKind
  message: string
  hint?: string
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
      (parsed.kind === "not_installed" || parsed.kind === "not_authenticated" || parsed.kind === "other") &&
      typeof parsed.message === "string" &&
      (parsed.hint === undefined || typeof parsed.hint === "string")
    ) {
      return parsed as AgentErrorPayload
    }
    return null
  } catch {
    return null
  }
}
