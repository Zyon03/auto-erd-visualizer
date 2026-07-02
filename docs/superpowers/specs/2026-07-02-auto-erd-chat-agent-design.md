# Auto ERD — Chat & Agent Layer Design

## Purpose

The original design (`2026-07-01-auto-erd-design.md`) scoped two plans: Plan 1, a manually-operable ERD editor (sessions, SQLite schema, canvas, DDL export — **built**), and Plan 2, the chat-driven AI agent layer on top of it (**never built**). This document specifies Plan 2, and additionally redesigns the Plan-1 UI surfaces that currently rely on `window.prompt()`/`window.confirm()` dialogs, since the new chat-first layout replaces most of that interaction model anyway.

When this ships, describing a system in chat should incrementally build the ERD on a full-screen canvas, with a floating chat panel over it — matching a familiar AI-chat product feel rather than a form-driven admin UI.

## Implementation Risk Resolved

The original spec flagged an open risk: whether headless Claude Code's `-p` mode supports native multi-turn session continuity, or whether full chat history must be replayed as context on every call. This was spiked and confirmed directly:

```
claude -p "Remember this number: 42. Just reply with 'ok'." --session-id <uuid>
# → "ok"
claude -p "What number did I ask you to remember?" --resume <uuid>
# → "42."
```

**Native `--session-id` / `--resume` continuity works.** No manual history replay is needed — each AutoERD session gets one Claude session UUID, used for the first turn (`--session-id`) and every subsequent turn (`--resume`).

## Architecture

```
Browser (React) ── sidebar (sessions) + session view (full-bleed canvas + floating chat)
      │  server functions (RPC) + SSE stream for live turn updates
      ▼
TanStack Start backend (Node)
      │
      ├─ SQLite (via Drizzle) ── sessions (+ claude_session_id), tables, fields,
      │                          relationships, chat_messages
      │
      └─ spawns `claude -p "<msg>" [--session-id <uuid> | --resume <uuid>]
                  --output-format stream-json --mcp-config <path>` per turn
              │
              └─ connects to an MCP server (spawned per the CLI's --mcp-config,
                   sharing the same mutation functions/SQLite file as the backend)
                   exposing: get_schema, add_table, rename_table, delete_table,
                   add_field, rename_field, update_field, delete_field,
                   add_relationship, update_relationship
```

Every MCP tool call and every manual UI edit go through the same mutation functions against SQLite — one source of truth, one write path, unchanged from the original design.

## Data Model Changes

One addition to the existing schema:

- **`sessions.claude_session_id`**: `text`, nullable. Set on the first chat turn (`--session-id <uuid>`); reused on every later turn (`--resume <uuid>`).

Everything else (`tables`, `fields`, `relationships`, `chat_messages`) is unchanged from the original spec.

## Turn Lifecycle

1. User sends a chat message → saved as a `chat_messages` row (`role: 'user'`), input box disabled, a "thinking" indicator shown.
2. Backend resolves the message to send to Claude: if any manual edits happened since the last turn, their system notes (already appended to `chat_messages` per the existing manual-edit flow) are prepended as a bracketed context block ahead of the user's actual text, e.g. `[table #3 renamed 'users' → 'M_Users']\n\n<user message>` — this is necessary because native `--resume` only carries what Claude itself said/heard in-session, not rows written directly into our own `chat_messages` table.
3. Backend spawns `claude -p "<resolved message>" [--session-id <uuid> | --resume <uuid>] --output-format stream-json --mcp-config <path>` and starts reading its stdout line by line.
4. As each `tool_use` result streams back, it's applied to SQLite **immediately and independently** (never batched at turn-end): the mutation runs, a `chat_messages` "step" row is inserted (e.g. *"Added table `users`"*), and an SSE event is pushed to the frontend so the canvas and chat update live, in the same tool-call-visible style as Claude Code itself.
5. On successful completion, the assistant's final text response is saved as a `chat_messages` row (`role: 'assistant'`) and an SSE `turn_complete` event re-enables the input box.
6. Manual UI edits (independent of any turn) call the same mutation functions directly and append a `system`-role `chat_messages` row, per step 2 above.

**Live updates transport:** Server-Sent Events. One SSE endpoint per session view; the backend pushes `tool_step`, `assistant_message`, `turn_error`, and `turn_complete` events as they occur. This is a personal local tool, so a simple one-way stream is sufficient — no WebSocket needed.

## Error Handling

A turn can fail three ways, all handled the same way at the surface:

- **Spawn failure** — the `claude` binary can't be found or `--mcp-config` is invalid; caught synchronously before any tool calls run.
- **Non-zero exit / explicit error** — `stream-json` ends with a `result` event carrying an error indicator; the backend checks it.
- **Timeout** — a watchdog timer resets on every line of output; if **5 minutes** pass with no output, the backend sends `SIGTERM` to the subprocess (there is no built-in `claude -p` timeout flag, so this is enforced by the backend).

In every case: whatever tool calls already succeeded stay committed (per-call commits, never batched, so partial progress is never corrupted). The backend inserts one final `system`-role `chat_messages` row describing the failure, emits a `turn_error` SSE event, and the frontend swaps its "thinking" indicator for that error message and re-enables input. Already-rendered tool-call steps remain visible above it.

**Turns survive tab close.** The spawned `claude` subprocess and its SQLite writes are entirely decoupled from the SSE connection's lifetime — closing the browser tab does not cancel an in-flight turn. Reopening the session replays whatever happened from `chat_messages` and the current schema state, and reattaches to the live SSE stream if the turn is still in flight.

**Session ID lifecycle on failure:** `claude_session_id` is persisted as soon as it's generated, before spawning. If the very first turn for a session fails before any output streamed back (e.g. a spawn failure), Claude's own session was never actually created, so `claude_session_id` is cleared and the next attempt starts fresh with `--session-id` again. If a turn fails after streaming had already begun (timeout, mid-stream error), the id is kept, since Claude's session does exist and later turns can still `--resume` it.

## UI / Layout

- **Sidebar** (fixed, narrow, left edge): lists sessions, "+ New session" at top, click to switch. Full-bleed canvas and chat live to its right.
- **Empty session (no messages yet):** a centered prompt over the empty canvas — *"Describe the system you want to model..."* — matching the blank-state feel of ChatGPT-style chat apps, not a form.
- **After the first message is sent:** the input animates down into a **bottom-anchored floating bar** — a translucent, blurred panel hovering near the bottom of the screen, showing recent messages with older history fading out at its top edge, expandable upward for more history, input pinned at the bottom of the panel. The canvas fills the entire viewport behind and around it at all times.
- **Tool calls render as visible steps** in the chat as they stream in (e.g. *"Added table `users`"*, *"Linked `orders.user_id` → `users.id`"*), followed by the assistant's summary message once the turn completes.
- Dark theme is unchanged (existing slate background, amber primary-key / teal foreign-key accents).
- **Manual editing moves off native dialogs:** double-click-to-rename stays, but `window.prompt()`/`window.confirm()` for adding tables/fields and deleting things are replaced with real inline UI — an "+ add field" row inside the table node, a delete affordance on hover, an on-canvas "+ add table" control — consistent with the chat-first, dialog-free feel of the rest of the app.

## Testing Approach

Unchanged from the original spec:

- Unit tests for pure logic: mutation functions and SQL DDL export (already in place).
- Manual testing for the chat/agent loop, SSE streaming, and canvas/chat interactions — an LLM's tool-calling behavior and live UI feel aren't meaningfully covered by unit tests.

## Scope Notes / Explicitly Out of Scope

Carried over from the original spec, still true:

- No authentication or multi-user support.
- No image/PNG export (SQL DDL export only).
- No auto-layout algorithm for new tables (cascade placement + manual drag).

Additionally out of scope for this pass:

- Editing/deleting individual chat messages.
- Multiple concurrent in-flight turns per session (one turn at a time; input is disabled while a turn is running).
- Cancel button for a running turn (only the timeout ends a hung turn; no user-initiated cancel in this pass).
