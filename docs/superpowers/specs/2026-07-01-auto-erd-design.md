# Auto ERD Visualizer — Design

## Purpose

A personal, local-first tool: describe a data model in chat, and an AI agent incrementally builds an entity-relationship diagram (ERD) from it. Tables and fields accumulate across the conversation as the spec grows. Work is organized into sessions (one session = one project/schema being designed), each with its own persisted diagram and chat history.

## Architecture

A single **TanStack Start** app (React + Vite + Nitro server) containing both frontend and backend:

```
Browser (React) ── dashboard (session list) + session view (chat + ERD canvas)
      │  server functions (RPC)
      ▼
TanStack Start backend (Node)
      │
      ├─ SQLite (via Drizzle) ── sessions, tables, fields, relationships, chat log
      │
      └─ spawns `claude -p --output-format stream-json --mcp-config ...` per turn
              │
              └─ connects to an in-process MCP server exposing ERD tools
                   (add_table, rename_table, delete_table, add_field,
                    rename_field, update_field, delete_field,
                    add_relationship, update_relationship, get_schema)
```

The agent runs via **headless Claude Code CLI** (not a direct Anthropic API integration), authenticated through the user's existing Claude Code subscription login rather than metered pay-per-token API billing. The Agent SDK and the CLI are the same underlying mechanism — the SDK drives the `claude` binary in non-interactive mode; using the CLI directly in headless mode gives the same tool-calling loop without a separate API key.

Every MCP tool call and every manual UI edit go through the **same underlying mutation functions** against SQLite. There is exactly one source of truth and one write path — the AI's view of the schema and the user's manual edits can never diverge into separate "versions," because next-turn context is always read fresh from the same store.

**Implementation risk to spike early:** headless Claude Code's session-continuity behavior (whether `-p` supports native multi-turn context, or whether the full chat history must be replayed each call) isn't confirmed in this design and should be verified as the first step of implementation, since it determines how turn-to-turn context is assembled.

## Data Model (SQLite via Drizzle)

All entities use stable surrogate IDs; renames only ever touch a `name` column, so relationships and history never break on rename.

- **`sessions`**: `id`, `name`, `created_at`, `updated_at`
- **`tables`**: `id`, `session_id`, `name`, `position_x`, `position_y`
- **`fields`**: `id`, `table_id`, `name`, `type`, `is_primary_key`, `is_foreign_key`, `order`
- **`relationships`**: `id`, `session_id`, `from_field_id`, `to_field_id`, `cardinality` (`one-to-many` | `one-to-one` | `many-to-many`), `ai_comment` (text shown on edge hover)
- **`chat_messages`**: `id`, `session_id`, `role` (`user` | `assistant` | `system`), `content`, `created_at`

Manual renames/edits append a `system` role chat message (e.g. *"table #3 (was 'users') renamed to 'M_Users'"*) so the agent has conversational awareness of user-made changes in later turns, even though correctness doesn't depend on it (correctness comes from ID-based references, not from telling the AI about changes).

Deleting a table cascades to its fields and any relationships referencing them.

## Agent Loop

1. User sends a chat message → saved as a `chat_messages` row.
2. Backend spawns `claude -p "<message>" --output-format stream-json --mcp-config <path>` with session context assembled per the continuity approach determined by the spike above.
3. The in-process MCP server exposes: `get_schema`, `add_table`, `rename_table`, `delete_table`, `add_field`, `rename_field`, `update_field`, `delete_field`, `add_relationship`, `update_relationship`.
4. As tool calls stream back, each is applied to SQLite immediately (not batched at the end), and the frontend receives incremental updates so the canvas updates live during generation.
5. Manual UI edits call the same mutation functions directly (no CLI involved) plus append the system-note chat message described above.

**Error handling:** if the `claude` subprocess fails or times out mid-turn, the error surfaces inline in the chat rather than crashing the session. Because SQLite writes happen per successful tool call, a failed turn just means partial progress — never a corrupted or half-written schema.

## Visualization

- **React Flow (`@xyflow/react`)** renders the canvas.
- Custom table node: header with table name, rows per field showing name, type, and icon (🔑 amber for primary key, 🔗 teal for foreign key).
- Custom edge: connects to the nearest side of each table node (auto-updates as nodes are dragged), hover reveals a tooltip with the AI-generated `ai_comment` describing the relationship in plain language (e.g. "A user can place multiple orders, but each order belongs to exactly one user").
- Table drag position persists to `position_x`/`position_y` on drag-end.
- New AI-created tables need an initial position — use simple cascade/grid placement (not a full auto-layout algorithm); manual dragging handles tidying.
- Inline editing: double-click a table or field name to edit in place; `cursor: pointer` on hover over any editable element; blur/enter commits through the shared mutation path.
- Dark theme throughout. Specific palette, typography, and chat UI polish (leaning toward a familiar AI-chat look — message bubbles, streaming text) are left to implementation-time judgment, per user preference for full styling freedom.

## Sessions

- **Dashboard** (landing page): lists sessions with name, last-updated timestamp, and table count. "New session" creates an empty one and opens directly into its chat + canvas view.
- Opening the app always lands on the dashboard first (not "resume last session").

## Export

- A button in the session view generates SQL DDL from the current schema: walk `tables` → `fields` to emit `CREATE TABLE` statements, then walk `relationships` to emit foreign key constraints.

## Tech Stack

- **TanStack Start** (React + Vite + Nitro) — frontend and backend in one app
- **React Flow (`@xyflow/react`)** — ERD canvas
- **Drizzle ORM + SQLite (better-sqlite3)** — persistence
- **Tailwind CSS** — styling
- **Headless Claude Code CLI + in-process MCP server** — agent runtime

## Testing Approach

- Unit tests for pure logic: mutation functions (add/rename/delete table/field/relationship) and SQL DDL export.
- Manual testing for the chat/agent loop and canvas interactions — an LLM's tool-calling behavior isn't meaningfully covered by unit tests, and canvas drag/hover interactions are best verified by hand.

## Scope Notes / Explicitly Out of Scope

- No authentication or multi-user support (personal, local-only tool).
- No image/PNG export (SQL DDL export only, for now).
- No auto-layout algorithm for new tables (simple cascade placement + manual drag).
