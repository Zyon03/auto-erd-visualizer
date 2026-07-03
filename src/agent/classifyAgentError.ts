export type AgentErrorKind = "not_installed" | "not_authenticated" | "other"

export interface AgentErrorClassification {
  kind: AgentErrorKind
  hint?: string
}

const NOT_INSTALLED_HINT =
  "Install it with `npm install -g @anthropic-ai/claude-code`, make sure `claude` is on your PATH, then try again."

const NOT_AUTHENTICATED_HINT =
  "Open a terminal, run `claude`, and complete the login flow — then send your message again."

// Loose text patterns for the auth-related failures the `claude` CLI prints to stderr (or
// occasionally reports inline via stream-json) when it can't find valid credentials. The CLI's
// exact wording isn't a stable contract, so this errs toward matching common phrasing rather
// than pinning to one exact string.
const AUTH_PATTERNS = [
  /not logged in/i,
  /please\s+(run|use)\s+.*login/i,
  /\/login/i,
  /log\s?in to (claude|continue)/i,
  /invalid api key/i,
  /invalid credentials/i,
  /authentication (failed|required|error)/i,
  /unauthorized/i,
  /please authenticate/i,
  /session (has )?expired/i,
  /token (is )?expired/i,
]

export function classifySpawnError(err: NodeJS.ErrnoException): AgentErrorClassification {
  if (err.code === "ENOENT") {
    return { kind: "not_installed", hint: NOT_INSTALLED_HINT }
  }
  return { kind: "other" }
}

export function classifyFailureText(text: string): AgentErrorClassification {
  if (text && AUTH_PATTERNS.some((pattern) => pattern.test(text))) {
    return { kind: "not_authenticated", hint: NOT_AUTHENTICATED_HINT }
  }
  return { kind: "other" }
}
