# Auto ERD

A personal, local-first ERD (entity-relationship diagram) visualizer. Sessions hold a schema (tables, fields, relationships); this app renders it as a draggable canvas and lets you edit it manually. A chat-driven AI agent layer is planned as a separate follow-up on top of this same data/mutation layer.

See [docs/superpowers/specs/2026-07-01-auto-erd-design.md](docs/superpowers/specs/2026-07-01-auto-erd-design.md) for the full design and [docs/superpowers/plans/2026-07-01-auto-erd-foundation.md](docs/superpowers/plans/2026-07-01-auto-erd-foundation.md) for the implementation plan.

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
