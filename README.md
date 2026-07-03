# ERDrew

Describe your data model in plain English. Watch it get drawn — live, on canvas, ready to export as SQL.

ERDrew pairs a chat-driven AI agent with a full manual ERD editor over the same schema. Tell it *"users can place orders, each order has multiple items,"* and it builds the tables, fields, and relationships in front of you — sensible field types and lengths, sound naming conventions, primary keys that default to the boring, correct choice instead of `uuid` everywhere. When something's genuinely ambiguous, it stops and asks instead of guessing. Everything it does, you can also do by hand: drag to connect two fields, rename anything inline, adjust a type's length without leaving the canvas.

No API key, no per-token billing — it runs on your existing Claude Code subscription. No cloud database — every session is one local SQLite file.

## Highlights

- **Chat-built schemas** — describe a system, watch tables, fields, and relationships get built live, with a running log of what changed.
- **Asks before it guesses** — a dedicated question prompt surfaces when a decision actually shapes the schema (cardinality, soft-deletes, normalization) and blocks nothing else while it waits for your answer.
- **Two views, one schema** — Fields view for full physical detail, Relations view for a clean, one-line-per-table-pair picture of how everything connects.
- **Manual editing, always** — every AI action has a hand-editable equivalent: drag-to-connect, inline rename, field type + length/precision, table roles.
- **Master/transactional conventions** — reference data and event/activity data are named and modeled differently by default, not left to guesswork.
- **One-click SQL export** — a real `CREATE TABLE` / `ALTER TABLE` DDL script, ready to run.
- **Local-first** — SQLite on disk, no account, no cloud sync. Nothing leaves your machine except the AI calls themselves.

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev         # start the dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```

## Stack

TanStack Start, React Flow (`@xyflow/react`), Drizzle ORM + SQLite (`better-sqlite3`), Tailwind CSS.

## Learn more

See [docs/superpowers/specs/2026-07-01-auto-erd-design.md](docs/superpowers/specs/2026-07-01-auto-erd-design.md) and [docs/superpowers/specs/2026-07-02-auto-erd-chat-agent-design.md](docs/superpowers/specs/2026-07-02-auto-erd-chat-agent-design.md) for the full design, and the corresponding files under [docs/superpowers/plans/](docs/superpowers/plans/) for how it was built.
