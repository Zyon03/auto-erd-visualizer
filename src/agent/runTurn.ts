// node:child_process's own `spawn` can't find npm-installed global CLIs on Windows: `claude`
// resolves to a `claude.cmd` shim there, and `.cmd`/`.bat` files aren't directly executable via
// CreateProcess, only through cmd.exe -- which plain `spawn` doesn't route through, producing an
// ENOENT even though `claude` works fine when typed into a terminal. cross-spawn (the same fix
// npm/husky/etc. use) detects this and routes through cmd.exe itself, escaping each argument
// individually so this stays safe even though `args` includes the user's own chat message text.
import spawn from "cross-spawn";
import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  addChatMessage,
  listChatMessages,
  type ChatMessage,
} from "../mutations/chatMessages";
import {
  getSession,
  setClaudeSessionId,
  clearClaudeSessionId,
} from "../mutations/sessions";
import { buildMcpConfig } from "./buildMcpConfig";
import { createStreamJsonParser } from "./parseStreamJson";
import { resolveTurnMessage } from "./resolveTurnMessage";
import { registerRunningTurn, clearRunningTurn } from "./runningTurns";
import { encodeQuestion } from "./questionMessage";
import { classifySpawnError, classifyFailureText, type AgentErrorKind } from "./classifyAgentError";
import { encodeAgentError } from "./agentErrorMessage";

type Db = BetterSQLite3Database<typeof schema>;

const TIMEOUT_MS = 5 * 60 * 1000;

const SYSTEM_PROMPT =
  "<role>\n" +
  "You are an ERD-building assistant embedded in a personal tool. The user describes a data model in conversation; " +
  "use the provided erd tools to incrementally build an entity-relationship diagram that matches what they describe. " +
  "Call get_schema first if you need to see the current state. Give relationships a short, direct, plain-language aiComment " +
  "describing what the relationship means.\n" +
  "</role>\n\n" +

  "<answering_questions>\n" +
  "Not every message requires a schema change. When the user asks something about the " +
  "system you're building together — is this table really master data, would you normalize this, what's a good " +
  "index here, why did you model it this way — just answer directly in plain text. Call get_schema first if you " +
  "need to check current state, but a plain-text reply never requires any other tool call, and an ordinary " +
  "question is not a reason to end your turn without one. Only reach for ask_question when you need the user's " +
  "input to decide what to build next.\n" +
  "</answering_questions>\n\n" +

  "<always_reply>\n" +
  "CRITICAL: never end a turn with only tool calls and no text. The user only sees your written reply, not " +
  "your tool-call log, so silence reads as the app having failed even when the work genuinely succeeded. This " +
  "matters most for a purely mechanical request (e.g. \"rename all the tables to use this prefix\") where it's " +
  "tempting to just make the calls and stop: still close with at least one short line, even something as brief " +
  "as \"Done — renamed all 9 tables. Anything else?\"\n\n" +
  "The one exception is ask_question: once you've called it, do not also add a text reply. The question and " +
  "its choices are already shown to the user as part of the tool call itself, so a follow-up line restating " +
  "it or saying something like \"let me know once you decide\" is redundant noise, not a helpful reply. See " +
  "<clarifying_questions> below.\n" +
  "</always_reply>\n\n" +

  "<field_types>\n" +
  "Include a sensible length for varchar fields instead of leaving it unspecified, e.g. " +
  "varchar(255) for emails/URLs/general free text, varchar(100) for names or titles, varchar(50) for " +
  "codes/slugs/phone numbers, varchar(20) for short identifiers — adjust based on what the field actually " +
  "holds rather than defaulting to one number every time.\n" +
  "</field_types>\n\n" +

  "<primary_keys>\n" +
  "Default every primary key to a plain integer (auto-increment), not uuid. This isn't a " +
  "scale decision — a bigint handles billions of rows fine, so don't pick uuid just because the system sounds " +
  "big or has lots of users. Reach for uuid only for a concrete reason: the id gets exposed publicly (a URL, " +
  "an API response) where guessing/enumerating other records' sequential ids would be a real problem, or the " +
  "system needs multiple services or offline clients generating ids independently without a central sequence. " +
  "Only ask_question about this when the user's own description already hints at one of those (public APIs, " +
  "mobile offline sync, multi-region/multi-service) — don't make it a standing question for every session.\n" +
  "</primary_keys>\n\n" +

  "<table_naming>\n" +
  "Unless the user asks for something else, prefix table names by role — `M_` for master/" +
  "reference data (relatively static lookup entities, e.g. M_User, M_Product, M_Category) and `T_` for " +
  "transactional data (records of events or activity, e.g. T_Order, T_Payment, T_LoginLog). If a table is a " +
  "many-to-many join table, name it after the two things it connects (e.g. T_OrderItem).\n" +
  "</table_naming>\n\n" +

  "<table_role>\n" +
  "Always set add_table's `role` param (master or transactional) using that same distinction — " +
  "what the table represents, not whether it happens to hold a foreign key. A table that references another " +
  "table is not automatically transactional (e.g. an Employee table with a department_id FK is still master " +
  "data); the app can only guess from foreign keys when `role` is left unset, and that guess is unreliable.\n" +
  "</table_role>\n\n" +

  "<corrections>\n" +
  "CRITICAL: when the user restates or contradicts something already modeled (e.g. \"actually each user can " +
  "only order once\" after users/orders was built as one-to-many), that's a correction, not a new fact — find " +
  "the existing relationship (get_schema, or the id from a prior tool result this conversation) and fix it with " +
  "update_relationship rather than calling add_relationship again. add_relationship will refuse a field pair " +
  "that's already connected and name the existing relationship's id in the error specifically so you can recover " +
  "in one follow-up call; use that id directly instead of re-fetching the whole schema to find it. The same " +
  "applies to tables and fields the user is correcting, not just relationships — rename/update/delete the " +
  "existing one rather than adding a second, contradictory one next to it.\n" +
  "</corrections>\n\n" +

  "<clarifying_questions>\n" +
  "Use ask_question when a requirement is genuinely ambiguous and the decision " +
  "meaningfully shapes the schema — e.g. a cardinality that could reasonably go either way, whether " +
  "something needs soft-deletes or an audit trail, whether a repeated value should be normalized into its " +
  "own lookup table. Lean toward asking while the schema is still sparse and the overall shape is being " +
  "decided; lean toward just building once the shape is established and what's left is mechanical. Don't " +
  "ask about things you can reasonably infer from context — every question has a cost, so only spend it on " +
  "decisions that actually change what gets built.\n\n" +
  "CRITICAL: after calling ask_question, stop. Do not call any more tools this turn, and do not add a text " +
  "reply either — the question and its choices are already presented to the user through the tool call, so " +
  "restating them or adding \"waiting on your answer\" filler is redundant. Just let your turn end so the " +
  "user can reply.\n" +
  "</clarifying_questions>\n\n" +

  "<session_naming>\n" +
  "If rename_session is available to you, this is a brand-new session and the user's first " +
  "message is the only chance to name it — call it once you understand what system they're describing, with " +
  "a short name (2-4 words) that's just the system itself, e.g. \"Library System\", \"E-commerce Store\", " +
  "\"Task Tracker\" — no \"Session\" prefix, no \"ERD for...\"/\"Database for...\" filler, no punctuation. Even " +
  "a vague first message deserves a best-guess name rather than skipping this — there's no later turn to " +
  "catch up on it. Call it early in the turn, alongside your first schema-building tool calls, not saved for " +
  "the end.\n" +
  "</session_naming>\n\n" +

  "<scope>\n" +
  "The erd tools are your only way to take action (no running code, no browsing, no other capabilities) — but " +
  "that's about *acting*, not *replying*: plain text is always available to you and is the right response to " +
  "anything that isn't a schema change or a clarifying question, per <answering_questions> above.\n" +
  "</scope>";

const BASE_ALLOWED_TOOLS = [
  "mcp__erd__get_schema",
  "mcp__erd__add_table",
  "mcp__erd__rename_table",
  "mcp__erd__delete_table",
  "mcp__erd__add_field",
  "mcp__erd__rename_field",
  "mcp__erd__update_field",
  "mcp__erd__delete_field",
  "mcp__erd__add_relationship",
  "mcp__erd__update_relationship",
  "mcp__erd__delete_relationship",
  "mcp__erd__ask_question",
];

export type TurnEvent =
  | { type: "tool_call_started"; toolName: string }
  | { type: "tool_step"; toolName: string; stepText: string }
  | { type: "assistant_note"; text: string }
  | { type: "ask_question"; question: string; choices: string[]; allowMultiple: boolean }
  | { type: "session_renamed"; name: string }
  | { type: "turn_complete"; text: string }
  | { type: "turn_error"; kind: AgentErrorKind; message: string; hint?: string };

export function runTurn(
  db: Db,
  sessionId: number,
  rawUserMessage: string,
  databasePath: string,
  onEvent: (event: TurnEvent) => void,
): ChatMessage {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Read history and resolve pending system notes BEFORE inserting this turn's user
  // message -- otherwise this message would immediately become the "last user message"
  // and resolveTurnMessage's pending-notes window would always be empty.
  const priorMessages = listChatMessages(db, sessionId);
  const resolvedMessage = resolveTurnMessage(priorMessages, rawUserMessage);
  const userMessageRow = addChatMessage(db, sessionId, "user", rawUserMessage);

  const isFirstTurn = !session.claudeSessionId;
  const claudeSessionId = session.claudeSessionId ?? randomUUID();
  if (isFirstTurn) {
    setClaudeSessionId(db, sessionId, claudeSessionId);
  }

  const mcpConfig = buildMcpConfig(sessionId, databasePath);

  // rename_session is only ever offered on a session's first turn — see the "Session naming"
  // paragraph in SYSTEM_PROMPT above. erdTools.ts's own default-name guard is a second layer,
  // for the edge case of a session renamed manually before its first message.
  const allowedTools = isFirstTurn ? [...BASE_ALLOWED_TOOLS, "mcp__erd__rename_session"] : BASE_ALLOWED_TOOLS;

  const args = [
    "-p",
    resolvedMessage,
    isFirstTurn ? "--session-id" : "--resume",
    claudeSessionId,
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    mcpConfig,
    "--strict-mcp-config",
    "--allowedTools",
    allowedTools.join(","),
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--system-prompt",
    SYSTEM_PROMPT,
  ];

  if (session.model) {
    args.push("--model", session.model);
  }

  // cross-spawn's types don't narrow on the (stdio-less) options overload the way node:child_process's
  // own do, but the child is still created with the same default 'pipe' stdio -- stdout/stderr are
  // never null in practice.
  const child = spawn("claude", args, { cwd: process.cwd() }) as ChildProcessWithoutNullStreams;
  const parser = createStreamJsonParser();
  const rl = readline.createInterface({ input: child.stdout });

  let streamedAnything = false;
  let settled = false;
  let cancelledByUser = false;

  // Drained (not just piped to readline like stdout) so a chatty stderr can't fill the OS pipe
  // buffer and block the child process — and so its text is available to classify failures
  // (e.g. "not logged in") that only show up on stderr, not in stdout's stream-json.
  let stderrBuffer = "";
  const MAX_STDERR_LEN = 8000;
  child.stderr.on("data", (chunk: Buffer) => {
    if (stderrBuffer.length < MAX_STDERR_LEN) {
      stderrBuffer = (stderrBuffer + chunk.toString()).slice(0, MAX_STDERR_LEN);
    }
  });

  registerRunningTurn(sessionId, {
    cancel: () => {
      cancelledByUser = true;
      child.kill("SIGTERM");
    },
  });

  const watchdog = setTimeout(() => {
    if (settled) return;
    child.kill("SIGTERM");
    finish({
      type: "turn_error",
      kind: "other",
      message:
        "The AI stopped responding and was cancelled after 5 minutes of inactivity.",
    });
  }, TIMEOUT_MS);

  function resetWatchdog() {
    watchdog.refresh();
  }

  // The session can be deleted out from under a turn that's still streaming (the delete handler
  // cancels the child process, but its exit is asynchronous). Once that's happened there's no
  // longer a row to write chat messages against (FK violation) and no one listening for
  // onEvent — worse, onEvent's publishTurnEvent would silently recreate a session emitter that
  // was just deleted, undoing the leak cleanup on session delete. Checked once and cached since
  // a deleted session never comes back.
  let sessionGone = false;
  function checkSessionGone(): boolean {
    if (!sessionGone && !getSession(db, sessionId)) {
      sessionGone = true;
    }
    return sessionGone;
  }

  function finish(event: TurnEvent) {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    clearRunningTurn(sessionId);

    if (checkSessionGone()) return;

    if (event.type === "turn_error" && !streamedAnything && !cancelledByUser) {
      clearClaudeSessionId(db, sessionId);
    }

    if (event.type === "turn_complete" && event.text) {
      addChatMessage(db, sessionId, "assistant", event.text);
    } else if (event.type === "turn_complete") {
      // A turn can succeed (exit 0, no error) and still produce zero output -- no closing text,
      // no tool calls at all. That used to be genuinely invisible: no chat_messages row, nothing
      // for the frontend to show, "thinking" just stops. Tagged the same always-visible way as
      // turn_error so the user gets a concrete signal instead of silently having to guess and
      // re-send the same message.
      addChatMessage(
        db,
        sessionId,
        "system",
        encodeAgentError({ kind: "other", message: "The AI didn't reply that time." }),
      );
    } else if (event.type === "turn_error") {
      // Always tagged, not just the two actionable kinds -- see agentErrorMessage.ts's doc
      // comment for why a plain-text "other" error used to silently vanish behind the chat
      // panel's activity-log toggle.
      addChatMessage(db, sessionId, "system", encodeAgentError({ kind: event.kind, message: event.message, hint: event.hint }));
    }

    onEvent(event);
  }

  rl.on("line", (line) => {
    resetWatchdog();
    streamedAnything = true;
    if (checkSessionGone()) return;

    for (const evt of parser.parseLine(line)) {
      if (evt.kind === "tool_call_started") {
        // Transient, like assistant_note -- purely a "the AI is doing X right now" indicator,
        // superseded by the tool_step event once the call actually finishes. Never persisted.
        onEvent({ type: "tool_call_started", toolName: evt.toolName });
      } else if (evt.kind === "tool_step") {
        addChatMessage(db, sessionId, "system", evt.stepText);
        onEvent({
          type: "tool_step",
          toolName: evt.toolName,
          stepText: evt.stepText,
        });
        if (evt.toolName === "rename_session") {
          // Re-read rather than parsing evt.stepText -- the MCP server (a separate process) may
          // have declined the rename (default-name guard), so the DB row is the source of truth
          // for what the name actually is now, not the tool's summary text.
          const renamedSession = getSession(db, sessionId);
          if (renamedSession) onEvent({ type: "session_renamed", name: renamedSession.name });
        }
      } else if (evt.kind === "assistant_text") {
        // Transient narration, not a durable log entry — published over SSE only, never
        // written to chat_messages (unlike tool_step's system notes or the final turn_complete).
        onEvent({ type: "assistant_note", text: evt.text });
      } else if (evt.kind === "ask_question") {
        // Persisted as a normal assistant-role message (tagged JSON, see questionMessage.ts) so
        // reloading the session still shows the question — it's just another chat message.
        addChatMessage(
          db,
          sessionId,
          "assistant",
          encodeQuestion({ question: evt.question, choices: evt.choices, allowMultiple: evt.allowMultiple }),
        );
        onEvent({
          type: "ask_question",
          question: evt.question,
          choices: evt.choices,
          allowMultiple: evt.allowMultiple,
        });
      } else if (evt.kind === "turn_result") {
        if (evt.success) {
          finish({ type: "turn_complete", text: evt.text });
        } else {
          const text = evt.text || "The AI turn ended with an error.";
          const { kind, hint } = classifyFailureText(text);
          finish({ type: "turn_error", kind, hint, message: text });
        }
      }
    }
  });

  child.on("error", (err) => {
    const { kind, hint } = classifySpawnError(err as NodeJS.ErrnoException);
    finish({
      type: "turn_error",
      kind,
      hint,
      message:
        kind === "not_installed"
          ? "Couldn't find the Claude Code CLI on this machine."
          : `Failed to start the AI agent process (${(err as Error).message}).`,
    });
  });

  child.on("close", (code) => {
    if (settled) return;
    if (cancelledByUser) {
      finish({ type: "turn_error", kind: "other", message: "Stopped." });
      return;
    }
    if (code === 0) {
      finish({ type: "turn_complete", text: "" });
      return;
    }
    const { kind, hint } = classifyFailureText(stderrBuffer);
    finish({
      type: "turn_error",
      kind,
      hint,
      message:
        kind === "not_authenticated"
          ? "Claude Code isn't logged in on this machine."
          : `The AI process exited unexpectedly (code ${code}).`,
    });
  });

  return userMessageRow;
}
