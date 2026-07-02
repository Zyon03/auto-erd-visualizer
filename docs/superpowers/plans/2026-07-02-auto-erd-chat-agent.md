# Auto ERD Chat & Agent Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the chat-driven AI agent layer (Plan 2) on top of the existing manual ERD editor (Plan 1): a headless-Claude-Code-powered turn loop that incrementally builds the schema via MCP tool calls, streamed live to a chat-first UI (sidebar of sessions, full-bleed canvas, floating chat panel), with relationships becoming AI-only.

**Architecture:** The TanStack Start backend spawns `claude -p` per chat turn, using native `--session-id`/`--resume` continuity (confirmed working via direct spike — no manual history replay needed). Claude drives an MCP server (spawned via `--mcp-config`) whose tools call the *same* mutation functions Plan 1 already built. Tool-call results and the final assistant message stream back over `stream-json`, get parsed into typed events, persisted to `chat_messages`, and published over an in-memory event bus that an SSE route relays to the browser. The frontend consumes that stream to update the canvas and a floating chat panel live.

**Tech Stack:** Same as Plan 1 (TanStack Start, Drizzle + better-sqlite3, `@xyflow/react`, Tailwind, Vitest, Zod), plus `@modelcontextprotocol/sdk` for the MCP server and Node's built-in `child_process`/`readline`/`events` for the agent turn loop.

## Global Constraints

- Personal, local-only tool — no auth, no multi-tenancy (unchanged from Plan 1).
- Every MCP tool call and every manual UI edit go through the same mutation functions — never duplicate mutation logic.
- Dark theme: slate background, amber (`text-amber-400`) for primary-key indicators, teal (`text-teal-400`) for foreign-key indicators and relationship lines (unchanged from Plan 1).
- **Relationship creation has guardrails.** Both the AI (via MCP tool calls) and manual drag-to-connect create relationships through the same `addRelationship` mutation function (Task 15 adds validation there so it applies uniformly to both paths): a field may not relate to itself, and two fields may only have one relationship between them (checked in both directions). Self-referencing tables (two different fields on the same table, e.g. `employees.manager_id` → `employees.id`) remain valid.
- The spawned `claude -p` process must run with `--setting-sources ""` and `--disable-slash-commands` so it does not inherit the developer's personal Claude Code skills/hooks/plugins — confirmed via spike that this eliminates ~9K tokens of irrelevant SessionStart-hook injection per turn.
- `spawn('claude', args)` works directly on this Windows machine without `shell: true` (confirmed via spike: `claude` resolves to a real `.exe`, not a `.cmd` shim) — do not add `shell: true`.
- Commit after every task passes its tests.

---

### Task 1: Add `claudeSessionId` to the sessions table

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0001_*.sql` (generated)

**Interfaces:**
- Consumes: `sessions` table from Plan 1.
- Produces: `sessions.claudeSessionId: string | null` column, available to every later task via `src/db/schema.ts`.

- [ ] **Step 1: Add the column**

In `src/db/schema.ts`, add `claudeSessionId` to the `sessions` table definition:

```typescript
export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  claudeSessionId: text('claude_session_id'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})
```

- [ ] **Step 2: Generate the migration**

```bash
npx drizzle-kit generate
```

Expected: a new file appears under `drizzle/` (e.g. `drizzle/0001_*.sql`) containing `ALTER TABLE sessions ADD COLUMN claude_session_id text;`. Commit this generated file.

- [ ] **Step 3: Verify existing tests still pass**

```bash
npx vitest run tests/mutations/sessions.test.ts tests/db/client.test.ts
```

Expected: PASS — the new nullable column doesn't break any existing row shape.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add claudeSessionId column to sessions table"
```

---

### Task 2: Session mutations for Claude session ID lifecycle

**Files:**
- Modify: `src/mutations/sessions.ts`
- Test: `tests/mutations/sessions.test.ts`

**Interfaces:**
- Consumes: `sessions` table (Task 1).
- Produces: `setClaudeSessionId(db, sessionId, claudeSessionId): Session`, `clearClaudeSessionId(db, sessionId): Session`, updated `Session` type with `claudeSessionId: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mutations/sessions.test.ts`:

```typescript
import { setClaudeSessionId, clearClaudeSessionId } from '../../src/mutations/sessions'
```

(add to the existing import line from `../../src/mutations/sessions`)

```typescript
  it('sets and clears the claude session id', () => {
    const session = createSession(db, 'Session C')
    expect(session.claudeSessionId).toBeNull()

    const withId = setClaudeSessionId(db, session.id, 'abc-123')
    expect(withId.claudeSessionId).toBe('abc-123')

    const cleared = clearClaudeSessionId(db, session.id)
    expect(cleared.claudeSessionId).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/mutations/sessions.test.ts
```

Expected: FAIL — `setClaudeSessionId`/`clearClaudeSessionId` don't exist yet.

- [ ] **Step 3: Update `src/mutations/sessions.ts`**

Update the `Session` interface, add the two functions, **and** add `claudeSessionId` to `listSessions`'s explicit column selection — it only selects specific columns (not `select().from(...)`), so without this change the function's return type silently stops matching `SessionSummary` once that interface requires the new field:

```typescript
export interface Session {
  id: number
  name: string
  claudeSessionId: string | null
  createdAt: string
  updatedAt: string
}
```

```typescript
export function listSessions(db: Db): SessionSummary[] {
  return db
    .select({
      id: sessions.id,
      name: sessions.name,
      claudeSessionId: sessions.claudeSessionId,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      tableCount: sql<number>`(select count(*) from ${tables} where ${tables.sessionId} = ${sessions.id})`,
    })
    .from(sessions)
    .all()
}
```

Replace the existing `listSessions` function with this version (only the added `claudeSessionId: sessions.claudeSessionId,` line changes).

```typescript
export function setClaudeSessionId(db: Db, sessionId: number, claudeSessionId: string): Session {
  const [row] = db.update(sessions).set({ claudeSessionId }).where(eq(sessions.id, sessionId)).returning().all()
  return row
}

export function clearClaudeSessionId(db: Db, sessionId: number): Session {
  const [row] = db.update(sessions).set({ claudeSessionId: null }).where(eq(sessions.id, sessionId)).returning().all()
  return row
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/mutations/sessions.test.ts
```

Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/mutations/sessions.ts tests/mutations/sessions.test.ts
git commit -m "feat: add claude session id lifecycle mutations"
```

---

### Task 3: Chat message mutations

**Files:**
- Create: `src/mutations/chatMessages.ts`
- Test: `tests/mutations/chatMessages.test.ts`

**Interfaces:**
- Consumes: `chatMessages` table from `src/db/schema.ts` (Plan 1, already exists, untouched).
- Produces: `addChatMessage(db, sessionId, role, content): ChatMessage`, `listChatMessages(db, sessionId): ChatMessage[]`, types `ChatMessage`, `ChatRole`.

- [ ] **Step 1: Write the failing tests**

`tests/mutations/chatMessages.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addChatMessage, listChatMessages } from '../../src/mutations/chatMessages'

describe('chat message mutations', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('adds a chat message', () => {
    const message = addChatMessage(db, sessionId, 'user', 'add a users table')
    expect(message.role).toBe('user')
    expect(message.content).toBe('add a users table')
    expect(message.sessionId).toBe(sessionId)
  })

  it('lists chat messages in insertion order', () => {
    addChatMessage(db, sessionId, 'user', 'first')
    addChatMessage(db, sessionId, 'assistant', 'second')
    addChatMessage(db, sessionId, 'system', 'third')

    const messages = listChatMessages(db, sessionId)
    expect(messages.map((m) => m.content)).toEqual(['first', 'second', 'third'])
  })

  it('only lists messages for the given session', () => {
    const otherSessionId = createSession(db, 'Other').id
    addChatMessage(db, sessionId, 'user', 'mine')
    addChatMessage(db, otherSessionId, 'user', 'theirs')

    const messages = listChatMessages(db, sessionId)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('mine')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/mutations/chatMessages.test.ts
```

Expected: FAIL — `src/mutations/chatMessages.ts` doesn't exist yet.

- [ ] **Step 3: Write `src/mutations/chatMessages.ts`**

```typescript
import { eq, asc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { chatMessages } from '../db/schema'

type Db = BetterSQLite3Database<typeof schema>

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: number
  sessionId: number
  role: ChatRole
  content: string
  createdAt: string
}

export function addChatMessage(db: Db, sessionId: number, role: ChatRole, content: string): ChatMessage {
  const [row] = db.insert(chatMessages).values({ sessionId, role, content }).returning().all()
  return row as ChatMessage
}

export function listChatMessages(db: Db, sessionId: number): ChatMessage[] {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id))
    .all() as ChatMessage[]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/mutations/chatMessages.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mutations/chatMessages.ts tests/mutations/chatMessages.test.ts
git commit -m "feat: add chat message mutations"
```

---

### Task 4: Manual edits append system chat notes

The original design requires manual UI edits to append a `system`-role chat message so the AI has conversational awareness of user-made changes (e.g. *"Table `users` renamed to `M_Users`"*). Plan 1 never implemented this. This task adds it at the `src/server-fns/schema.ts` layer, which is the single place both the canvas UI and (later) this task's tests call through.

Table/field position drags do **not** get a system note — they're cosmetic, not schema information the AI needs.

**Files:**
- Modify: `src/mutations/tables.ts` (add `getTable`, change `deleteTable` to return the deleted row)
- Modify: `src/mutations/fields.ts` (add `getField`, change `deleteField` to return the deleted row)
- Modify: `src/server-fns/schema.ts` (append system notes after each manual mutation)
- Test: `tests/mutations/tables.test.ts`, `tests/mutations/fields.test.ts` (extend)

**Interfaces:**
- Consumes: `addChatMessage` (Task 3).
- Produces: `getTable(db, tableId): Table | undefined`, `deleteTable(db, tableId): Table | undefined` (was `void`), `getField(db, fieldId): Field | undefined`, `deleteField(db, fieldId): Field | undefined` (was `void`).

- [ ] **Step 1: Write the failing tests for the mutation changes**

Add to `tests/mutations/tables.test.ts`:

```typescript
import { addTable, renameTable, updateTablePosition, deleteTable, getTable } from '../../src/mutations/tables'
```

(replace the existing import line)

```typescript
  it('gets a table by id', () => {
    const table = addTable(db, sessionId, 'users')
    const found = getTable(db, table.id)
    expect(found?.name).toBe('users')
  })

  it('returns the deleted table', () => {
    const table = addTable(db, sessionId, 'users')
    const deleted = deleteTable(db, table.id)
    expect(deleted?.name).toBe('users')
    expect(getTable(db, table.id)).toBeUndefined()
  })
```

Add to `tests/mutations/fields.test.ts`:

```typescript
import { addField, renameField, updateField, deleteField, getField } from '../../src/mutations/fields'
```

(replace the existing import line)

```typescript
  it('gets a field by id', () => {
    const field = addField(db, tableId, 'name', 'text')
    const found = getField(db, field.id)
    expect(found?.name).toBe('name')
  })

  it('returns the deleted field', () => {
    const field = addField(db, tableId, 'name', 'text')
    const deleted = deleteField(db, field.id)
    expect(deleted?.name).toBe('name')
    expect(getField(db, field.id)).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/mutations/tables.test.ts tests/mutations/fields.test.ts
```

Expected: FAIL — `getTable`/`getField` don't exist, `deleteTable`/`deleteField` don't return values.

- [ ] **Step 3: Update `src/mutations/tables.ts`**

Add `getTable` and change `deleteTable`'s return:

```typescript
export function getTable(db: Db, tableId: number): Table | undefined {
  return db.select().from(tables).where(eq(tables.id, tableId)).get()
}

export function deleteTable(db: Db, tableId: number): Table | undefined {
  const [row] = db.delete(tables).where(eq(tables.id, tableId)).returning().all()
  return row
}
```

Replace the existing `deleteTable` function with this version.

- [ ] **Step 4: Update `src/mutations/fields.ts`**

Add `getField` and change `deleteField`'s return:

```typescript
export function getField(db: Db, fieldId: number): Field | undefined {
  return db.select().from(fields).where(eq(fields.id, fieldId)).get()
}

export function deleteField(db: Db, fieldId: number): Field | undefined {
  const [row] = db.delete(fields).where(eq(fields.id, fieldId)).returning().all()
  return row
}
```

Replace the existing `deleteField` function with this version.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/mutations/tables.test.ts tests/mutations/fields.test.ts
```

Expected: PASS (11 tables tests, 7 fields tests).

- [ ] **Step 6: Update `src/server-fns/schema.ts` to append system notes**

Read the current file first, then replace it in full with:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { getFullSchema } from '../mutations/getFullSchema'
import { addTable, renameTable, updateTablePosition, deleteTable, getTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField, getField } from '../mutations/fields'
import { addChatMessage } from '../mutations/chatMessages'

export const getFullSchemaFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => getFullSchema(db, data.sessionId))

export const addTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const table = addTable(db, data.sessionId, data.name)
    addChatMessage(db, data.sessionId, 'system', `Table \`${table.name}\` added manually`)
    return table
  })

export const renameTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const before = getTable(db, data.tableId)
    const table = renameTable(db, data.tableId, data.name)
    if (before) {
      addChatMessage(db, table.sessionId, 'system', `Table \`${before.name}\` renamed to \`${table.name}\``)
    }
    return table
  })

export const updateTablePositionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), positionX: z.number(), positionY: z.number() }))
  .handler(async ({ data }) => updateTablePosition(db, data.tableId, data.positionX, data.positionY))

export const deleteTableFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number() }))
  .handler(async ({ data }) => {
    const deleted = deleteTable(db, data.tableId)
    if (deleted) {
      addChatMessage(db, deleted.sessionId, 'system', `Table \`${deleted.name}\` deleted manually`)
    }
  })

export const addFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ tableId: z.number(), name: z.string().min(1), type: z.string().min(1) }))
  .handler(async ({ data }) => {
    const field = addField(db, data.tableId, data.name, data.type)
    const table = getTable(db, data.tableId)
    if (table) {
      addChatMessage(db, table.sessionId, 'system', `Field \`${field.name}\` added to \`${table.name}\``)
    }
    return field
  })

export const renameFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ fieldId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const before = getField(db, data.fieldId)
    const field = renameField(db, data.fieldId, data.name)
    if (before) {
      const table = getTable(db, field.tableId)
      if (table) {
        addChatMessage(db, table.sessionId, 'system', `Field \`${before.name}\` renamed to \`${field.name}\``)
      }
    }
    return field
  })

export const updateFieldFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      fieldId: z.number(),
      type: z.string().min(1).optional(),
      isPrimaryKey: z.boolean().optional(),
      isForeignKey: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { fieldId, ...changes } = data
    return updateField(db, fieldId, changes)
  })

export const deleteFieldFn = createServerFn({ method: 'POST' })
  .validator(z.object({ fieldId: z.number() }))
  .handler(async ({ data }) => {
    const table = getTable(db, (getField(db, data.fieldId))?.tableId ?? -1)
    const deleted = deleteField(db, data.fieldId)
    if (deleted && table) {
      addChatMessage(db, table.sessionId, 'system', `Field \`${deleted.name}\` deleted`)
    }
  })
```

Note `addRelationshipFn` is **removed** from this file — relationships become AI-only starting in Task 15.

- [ ] **Step 7: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. (`sessions.$sessionId.tsx` will show an error for the now-missing `addRelationshipFn` import — that's expected and gets fixed in Task 15. If you want a clean typecheck at this step, temporarily leave `addRelationshipFn` in place and remove it as part of Task 15 instead; either ordering is fine, but don't skip removing it.)

- [ ] **Step 8: Commit**

```bash
git add src/mutations/tables.ts src/mutations/fields.ts src/server-fns/schema.ts tests/mutations/tables.test.ts tests/mutations/fields.test.ts
git commit -m "feat: append system chat notes on manual table/field edits"
```

---

### Task 5: ERD MCP tool handlers (pure)

A pure, MCP-SDK-independent layer mapping tool names to mutation calls. This is what Task 6's MCP server wraps, and what's directly unit-testable without spinning up stdio transport.

**Files:**
- Create: `src/mcp/erdTools.ts`
- Test: `tests/mcp/erdTools.test.ts`

**Interfaces:**
- Consumes: all mutation functions from `src/mutations/*` (Plan 1 + Tasks 2-4).
- Produces: `createErdTools(db, sessionId): ErdTools`, type `ErdToolResult { summary: string; data?: unknown }`.

- [ ] **Step 1: Write the failing tests**

`tests/mcp/erdTools.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { createErdTools } from '../../src/mcp/erdTools'

describe('createErdTools', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
  })

  it('adds a table and returns a human-readable summary', () => {
    const tools = createErdTools(db, sessionId)
    const result = tools.add_table({ name: 'users' })
    expect(result.summary).toBe('Added table `users`')
  })

  it('adds a field to a table', () => {
    const tools = createErdTools(db, sessionId)
    const table = tools.add_table({ name: 'users' }).data as { id: number }
    const result = tools.add_field({ tableId: table.id, name: 'email', type: 'text' })
    expect(result.summary).toBe('Added field `email` (text)')
  })

  it('adds a relationship between two fields', () => {
    const tools = createErdTools(db, sessionId)
    const users = tools.add_table({ name: 'users' }).data as { id: number }
    const orders = tools.add_table({ name: 'orders' }).data as { id: number }
    const userId = tools.add_field({ tableId: users.id, name: 'id', type: 'uuid', isPrimaryKey: true }).data as { id: number }
    const orderUserId = tools.add_field({ tableId: orders.id, name: 'user_id', type: 'uuid', isForeignKey: true }).data as { id: number }

    const result = tools.add_relationship({
      fromFieldId: userId.id,
      toFieldId: orderUserId.id,
      cardinality: 'one-to-many',
      aiComment: 'A user has many orders',
    })
    expect(result.summary).toBe('Linked fields with a one-to-many relationship')
  })

  it('gets the full schema', () => {
    const tools = createErdTools(db, sessionId)
    tools.add_table({ name: 'users' })
    const result = tools.get_schema()
    const data = result.data as { tables: unknown[] }
    expect(data.tables).toHaveLength(1)
  })

  it('deletes a relationship', () => {
    const tools = createErdTools(db, sessionId)
    const users = tools.add_table({ name: 'users' }).data as { id: number }
    const orders = tools.add_table({ name: 'orders' }).data as { id: number }
    const userId = tools.add_field({ tableId: users.id, name: 'id', type: 'uuid', isPrimaryKey: true }).data as { id: number }
    const orderUserId = tools.add_field({ tableId: orders.id, name: 'user_id', type: 'uuid', isForeignKey: true }).data as { id: number }
    const rel = tools.add_relationship({ fromFieldId: userId.id, toFieldId: orderUserId.id, cardinality: 'one-to-many' }).data as { id: number }

    const result = tools.delete_relationship({ relationshipId: rel.id })
    expect(result.summary).toBe(`Deleted relationship #${rel.id}`)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/mcp/erdTools.test.ts
```

Expected: FAIL — `src/mcp/erdTools.ts` doesn't exist yet.

- [ ] **Step 3: Write `src/mcp/erdTools.ts`**

```typescript
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { addTable, renameTable, deleteTable } from '../mutations/tables'
import { addField, renameField, updateField, deleteField } from '../mutations/fields'
import { addRelationship, updateRelationship, deleteRelationship, type Cardinality } from '../mutations/relationships'
import { getFullSchema } from '../mutations/getFullSchema'

type Db = BetterSQLite3Database<typeof schema>

export interface ErdToolResult {
  summary: string
  data?: unknown
}

export function createErdTools(db: Db, sessionId: number) {
  return {
    get_schema: (): ErdToolResult => {
      const schemaData = getFullSchema(db, sessionId)
      return { summary: `Schema has ${schemaData.tables.length} table(s).`, data: schemaData }
    },

    add_table: (input: { name: string }): ErdToolResult => {
      const table = addTable(db, sessionId, input.name)
      return { summary: `Added table \`${table.name}\``, data: table }
    },

    rename_table: (input: { tableId: number; name: string }): ErdToolResult => {
      const table = renameTable(db, input.tableId, input.name)
      return { summary: `Renamed table to \`${table.name}\``, data: table }
    },

    delete_table: (input: { tableId: number }): ErdToolResult => {
      const table = deleteTable(db, input.tableId)
      return { summary: table ? `Deleted table \`${table.name}\`` : `Table #${input.tableId} was already gone`, data: table }
    },

    add_field: (input: {
      tableId: number
      name: string
      type: string
      isPrimaryKey?: boolean
      isForeignKey?: boolean
    }): ErdToolResult => {
      const field = addField(db, input.tableId, input.name, input.type, input.isPrimaryKey ?? false, input.isForeignKey ?? false)
      return { summary: `Added field \`${field.name}\` (${field.type})`, data: field }
    },

    rename_field: (input: { fieldId: number; name: string }): ErdToolResult => {
      const field = renameField(db, input.fieldId, input.name)
      return { summary: `Renamed field to \`${field.name}\``, data: field }
    },

    update_field: (input: {
      fieldId: number
      type?: string
      isPrimaryKey?: boolean
      isForeignKey?: boolean
    }): ErdToolResult => {
      const { fieldId, ...changes } = input
      const field = updateField(db, fieldId, changes)
      return { summary: `Updated field \`${field.name}\``, data: field }
    },

    delete_field: (input: { fieldId: number }): ErdToolResult => {
      const field = deleteField(db, input.fieldId)
      return { summary: field ? `Deleted field \`${field.name}\`` : `Field #${input.fieldId} was already gone`, data: field }
    },

    add_relationship: (input: {
      fromFieldId: number
      toFieldId: number
      cardinality: Cardinality
      aiComment?: string
    }): ErdToolResult => {
      const rel = addRelationship(db, sessionId, input.fromFieldId, input.toFieldId, input.cardinality, input.aiComment ?? '')
      return { summary: `Linked fields with a ${rel.cardinality} relationship`, data: rel }
    },

    update_relationship: (input: {
      relationshipId: number
      cardinality?: Cardinality
      aiComment?: string
    }): ErdToolResult => {
      const { relationshipId, ...changes } = input
      const rel = updateRelationship(db, relationshipId, changes)
      return { summary: `Updated relationship #${rel.id}`, data: rel }
    },

    delete_relationship: (input: { relationshipId: number }): ErdToolResult => {
      deleteRelationship(db, input.relationshipId)
      return { summary: `Deleted relationship #${input.relationshipId}` }
    },
  }
}

export type ErdTools = ReturnType<typeof createErdTools>
export type ErdToolName = keyof ErdTools
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/mcp/erdTools.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mcp/erdTools.ts tests/mcp/erdTools.test.ts
git commit -m "feat: add pure ERD MCP tool handlers"
```

---

### Task 6: MCP server entrypoint

The executable script spawned as a subprocess by `claude -p --mcp-config`. Wraps Task 5's pure handlers with `@modelcontextprotocol/sdk`'s `McpServer` + Zod schemas, connected over stdio. Not unit tested (it's a thin wiring script over already-tested logic, and its correctness was confirmed against a real Claude Code process during design); verified manually in Task 10.

**Files:**
- Create: `src/mcp/server.ts`
- Modify: `package.json` (add `@modelcontextprotocol/sdk` dependency, add `tsx` devDependency)

**Interfaces:**
- Consumes: `createErdTools` (Task 5), `createDb` (Plan 1).
- Produces: an executable entrypoint at `src/mcp/server.ts`, run via `npx tsx src/mcp/server.ts`, reading `ERD_SESSION_ID` and `DATABASE_PATH` from its environment.

- [ ] **Step 1: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk
npm install -D tsx
```

- [ ] **Step 2: Write `src/mcp/server.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createDb } from '../db/client'
import { createErdTools } from './erdTools'

const sessionId = Number(process.env.ERD_SESSION_ID)
if (!Number.isInteger(sessionId)) {
  throw new Error('ERD_SESSION_ID env var must be an integer')
}

const db = createDb(process.env.DATABASE_PATH ?? './auto-erd.db')
const tools = createErdTools(db, sessionId)

const server = new McpServer({ name: 'auto-erd', version: '1.0.0' })

const cardinality = z.enum(['one-to-one', 'one-to-many', 'many-to-many'])

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

server.registerTool(
  'get_schema',
  {
    title: 'Get schema',
    description: 'Get the full current ERD schema (tables, fields, relationships) for this session.',
    inputSchema: {},
  },
  async () => textResult(JSON.stringify(tools.get_schema().data)),
)

server.registerTool(
  'add_table',
  { title: 'Add table', description: 'Add a new table to the ERD.', inputSchema: { name: z.string().min(1) } },
  async (input) => textResult(tools.add_table(input).summary),
)

server.registerTool(
  'rename_table',
  {
    title: 'Rename table',
    description: 'Rename an existing table by its id.',
    inputSchema: { tableId: z.number().int(), name: z.string().min(1) },
  },
  async (input) => textResult(tools.rename_table(input).summary),
)

server.registerTool(
  'delete_table',
  {
    title: 'Delete table',
    description: 'Delete a table and its fields/relationships by id.',
    inputSchema: { tableId: z.number().int() },
  },
  async (input) => textResult(tools.delete_table(input).summary),
)

server.registerTool(
  'add_field',
  {
    title: 'Add field',
    description: 'Add a new field to a table.',
    inputSchema: {
      tableId: z.number().int(),
      name: z.string().min(1),
      type: z.string().min(1),
      isPrimaryKey: z.boolean().optional(),
      isForeignKey: z.boolean().optional(),
    },
  },
  async (input) => textResult(tools.add_field(input).summary),
)

server.registerTool(
  'rename_field',
  {
    title: 'Rename field',
    description: 'Rename an existing field by its id.',
    inputSchema: { fieldId: z.number().int(), name: z.string().min(1) },
  },
  async (input) => textResult(tools.rename_field(input).summary),
)

server.registerTool(
  'update_field',
  {
    title: 'Update field',
    description: "Update a field's type or primary/foreign key flags.",
    inputSchema: {
      fieldId: z.number().int(),
      type: z.string().min(1).optional(),
      isPrimaryKey: z.boolean().optional(),
      isForeignKey: z.boolean().optional(),
    },
  },
  async (input) => textResult(tools.update_field(input).summary),
)

server.registerTool(
  'delete_field',
  { title: 'Delete field', description: 'Delete a field by id.', inputSchema: { fieldId: z.number().int() } },
  async (input) => textResult(tools.delete_field(input).summary),
)

server.registerTool(
  'add_relationship',
  {
    title: 'Add relationship',
    description:
      'Create a relationship between two fields, with a short plain-language description of what it means (e.g. "A user can place multiple orders, but each order belongs to exactly one user.").',
    inputSchema: {
      fromFieldId: z.number().int(),
      toFieldId: z.number().int(),
      cardinality,
      aiComment: z.string().optional(),
    },
  },
  async (input) => textResult(tools.add_relationship(input).summary),
)

server.registerTool(
  'update_relationship',
  {
    title: 'Update relationship',
    description: "Update a relationship's cardinality or description.",
    inputSchema: { relationshipId: z.number().int(), cardinality: cardinality.optional(), aiComment: z.string().optional() },
  },
  async (input) => textResult(tools.update_relationship(input).summary),
)

server.registerTool(
  'delete_relationship',
  { title: 'Delete relationship', description: 'Delete a relationship by id.', inputSchema: { relationshipId: z.number().int() } },
  async (input) => textResult(tools.delete_relationship(input).summary),
)

const transport = new StdioServerTransport()
await server.connect(transport)
```

- [ ] **Step 3: Verify it starts without crashing**

```bash
DATABASE_PATH=:memory: ERD_SESSION_ID=1 npx tsx src/mcp/server.ts &
sleep 1
kill %1
```

Expected: no error output before the kill (an MCP stdio server just sits waiting for JSON-RPC messages on stdin — silence is success). If you see a stack trace, fix it before proceeding.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts package.json package-lock.json
git commit -m "feat: add MCP server entrypoint exposing ERD tools"
```

---

### Task 7: Stream-json parser (pure)

Parses `claude -p --output-format stream-json` lines into typed events, filtering to only our `mcp__erd__*` tool calls (real Claude Code sessions also emit built-in tool calls like `ToolSearch` — confirmed via spike — which must be ignored). Test fixtures below are lines captured from an actual `claude -p` run against a real MCP server, not invented.

**Files:**
- Create: `src/agent/parseStreamJson.ts`
- Test: `tests/agent/parseStreamJson.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `createStreamJsonParser(): { parseLine(line: string): ParsedEvent[] }`, type `ParsedEvent`.

- [ ] **Step 1: Write the failing tests**

`tests/agent/parseStreamJson.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createStreamJsonParser } from '../../src/agent/parseStreamJson'

describe('createStreamJsonParser', () => {
  it('ignores non-erd tool calls (e.g. ToolSearch) and their results', () => {
    const parser = createStreamJsonParser()
    const toolUseLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_1', name: 'ToolSearch', input: { query: 'select:mcp__erd__add_table' } }] },
    })
    const toolResultLine = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'tool_reference', tool_name: 'mcp__erd__add_table' }] }] },
    })

    expect(parser.parseLine(toolUseLine)).toEqual([])
    expect(parser.parseLine(toolResultLine)).toEqual([])
  })

  it('emits a tool_step for an erd tool call, using the tool result text as the step text', () => {
    const parser = createStreamJsonParser()
    const toolUseLine = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 'toolu_2', name: 'mcp__erd__add_table', input: { name: 'ping_test' } }] },
    })
    const toolResultLine = JSON.stringify({
      type: 'user',
      message: { content: [{ tool_use_id: 'toolu_2', type: 'tool_result', content: [{ type: 'text', text: 'Added table ping_test with id 7' }] }] },
    })

    expect(parser.parseLine(toolUseLine)).toEqual([])
    expect(parser.parseLine(toolResultLine)).toEqual([
      { kind: 'tool_step', toolName: 'add_table', stepText: 'Added table ping_test with id 7' },
    ])
  })

  it('emits assistant_text for a plain text message', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } })

    expect(parser.parseLine(line)).toEqual([{ kind: 'assistant_text', text: 'Done.' }])
  })

  it('emits a successful turn_result from a success result event', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' })

    expect(parser.parseLine(line)).toEqual([{ kind: 'turn_result', success: true, text: 'Done.' }])
  })

  it('emits a failed turn_result when is_error is true', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'boom' })

    expect(parser.parseLine(line)).toEqual([{ kind: 'turn_result', success: false, text: 'boom' }])
  })

  it('ignores malformed JSON lines', () => {
    const parser = createStreamJsonParser()
    expect(parser.parseLine('not json')).toEqual([])
  })

  it('ignores system events like hook notifications', () => {
    const parser = createStreamJsonParser()
    const line = JSON.stringify({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup' })
    expect(parser.parseLine(line)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/agent/parseStreamJson.test.ts
```

Expected: FAIL — `src/agent/parseStreamJson.ts` doesn't exist yet.

- [ ] **Step 3: Write `src/agent/parseStreamJson.ts`**

```typescript
export type ParsedEvent =
  | { kind: 'tool_step'; toolName: string; stepText: string }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'turn_result'; success: boolean; text: string }

const MCP_TOOL_PREFIX = 'mcp__erd__'

interface JsonRecord {
  [key: string]: unknown
}

export function createStreamJsonParser() {
  const pendingToolNames = new Map<string, string>()

  function parseLine(line: string): ParsedEvent[] {
    const events: ParsedEvent[] = []

    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      return events
    }
    if (!parsed || typeof parsed !== 'object') return events
    const evt = parsed as JsonRecord

    if (evt.type === 'assistant') {
      const content = (evt.message as JsonRecord | undefined)?.content
      if (Array.isArray(content)) {
        for (const block of content as JsonRecord[]) {
          if (block.type === 'tool_use' && typeof block.name === 'string' && typeof block.id === 'string') {
            if (block.name.startsWith(MCP_TOOL_PREFIX)) {
              pendingToolNames.set(block.id, block.name.slice(MCP_TOOL_PREFIX.length))
            }
          } else if (block.type === 'text' && typeof block.text === 'string') {
            events.push({ kind: 'assistant_text', text: block.text })
          }
        }
      }
    }

    if (evt.type === 'user') {
      const content = (evt.message as JsonRecord | undefined)?.content
      if (Array.isArray(content)) {
        for (const block of content as JsonRecord[]) {
          if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
            const toolName = pendingToolNames.get(block.tool_use_id)
            if (!toolName) continue
            pendingToolNames.delete(block.tool_use_id)

            const resultContent = block.content
            const stepText = Array.isArray(resultContent)
              ? (resultContent as JsonRecord[])
                  .filter((c) => c.type === 'text' && typeof c.text === 'string')
                  .map((c) => c.text as string)
                  .join(' ')
              : ''
            events.push({ kind: 'tool_step', toolName, stepText })
          }
        }
      }
    }

    if (evt.type === 'result') {
      const isError = evt.is_error === true || evt.subtype !== 'success'
      const text = typeof evt.result === 'string' ? evt.result : ''
      events.push({ kind: 'turn_result', success: !isError, text })
    }

    return events
  }

  return { parseLine }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/agent/parseStreamJson.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/parseStreamJson.ts tests/agent/parseStreamJson.test.ts
git commit -m "feat: add stream-json parser for agent turns"
```

---

### Task 8: MCP config builder (pure)

**Files:**
- Create: `src/agent/buildMcpConfig.ts`
- Test: `tests/agent/buildMcpConfig.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `buildMcpConfig(sessionId, databasePath): string` — a JSON string suitable for `claude -p`'s `--mcp-config` argument.

- [ ] **Step 1: Write the failing test**

`tests/agent/buildMcpConfig.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildMcpConfig } from '../../src/agent/buildMcpConfig'

describe('buildMcpConfig', () => {
  it('produces a valid mcp config JSON string pointing at the erd server', () => {
    const configJson = buildMcpConfig(42, '/tmp/auto-erd.db')
    const config = JSON.parse(configJson)

    expect(config.mcpServers.erd.command).toBe('npx')
    expect(config.mcpServers.erd.args).toContain('tsx')
    expect(config.mcpServers.erd.env.ERD_SESSION_ID).toBe('42')
    expect(config.mcpServers.erd.env.DATABASE_PATH).toBe('/tmp/auto-erd.db')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent/buildMcpConfig.test.ts
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write `src/agent/buildMcpConfig.ts`**

```typescript
import path from 'node:path'

export function buildMcpConfig(sessionId: number, databasePath: string): string {
  return JSON.stringify({
    mcpServers: {
      erd: {
        command: 'npx',
        args: ['tsx', path.join(process.cwd(), 'src/mcp/server.ts')],
        env: {
          ERD_SESSION_ID: String(sessionId),
          DATABASE_PATH: databasePath,
        },
      },
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent/buildMcpConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/buildMcpConfig.ts tests/agent/buildMcpConfig.test.ts
git commit -m "feat: add mcp config builder for agent turns"
```

---

### Task 9: Turn message resolver (pure)

Implements the design's manual-edit awareness mechanism: prepend any `system`-role chat notes inserted since the last user/assistant turn, since native `--resume` only carries what Claude itself heard, not rows written directly into `chat_messages`.

**Files:**
- Create: `src/agent/resolveTurnMessage.ts`
- Test: `tests/agent/resolveTurnMessage.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` type (Task 3).
- Produces: `resolveTurnMessage(priorMessages, userMessage): string`.

- [ ] **Step 1: Write the failing tests**

`tests/agent/resolveTurnMessage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveTurnMessage } from '../../src/agent/resolveTurnMessage'
import type { ChatMessage } from '../../src/mutations/chatMessages'

function msg(role: ChatMessage['role'], content: string, id: number): ChatMessage {
  return { id, sessionId: 1, role, content, createdAt: '' }
}

describe('resolveTurnMessage', () => {
  it('returns the user message unchanged when there are no pending system notes', () => {
    const prior: ChatMessage[] = [msg('user', 'add users table', 1), msg('assistant', 'Added.', 2)]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe('now add orders')
  })

  it('prepends system notes added since the last user/assistant message', () => {
    const prior: ChatMessage[] = [
      msg('user', 'add users table', 1),
      msg('assistant', 'Added.', 2),
      msg('system', "Table `users` renamed to `M_Users`", 3),
    ]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe(
      "[Table `users` renamed to `M_Users`]\n\nnow add orders",
    )
  })

  it('prepends multiple pending system notes in order', () => {
    const prior: ChatMessage[] = [
      msg('assistant', 'Added.', 1),
      msg('system', 'note one', 2),
      msg('system', 'note two', 3),
    ]
    expect(resolveTurnMessage(prior, 'continue')).toBe('[note one]\n[note two]\n\ncontinue')
  })

  it('ignores system notes from before the last user/assistant message', () => {
    const prior: ChatMessage[] = [
      msg('system', 'stale note', 1),
      msg('user', 'add users table', 2),
      msg('assistant', 'Added.', 3),
    ]
    expect(resolveTurnMessage(prior, 'now add orders')).toBe('now add orders')
  })

  it('handles an empty prior message list', () => {
    expect(resolveTurnMessage([], 'start here')).toBe('start here')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/agent/resolveTurnMessage.test.ts
```

Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Write `src/agent/resolveTurnMessage.ts`**

```typescript
import type { ChatMessage } from '../mutations/chatMessages'

export function resolveTurnMessage(priorMessages: ChatMessage[], userMessage: string): string {
  let lastUserOrAssistantIndex = -1
  for (let i = priorMessages.length - 1; i >= 0; i--) {
    if (priorMessages[i].role === 'user' || priorMessages[i].role === 'assistant') {
      lastUserOrAssistantIndex = i
      break
    }
  }

  const pendingSystemNotes = priorMessages
    .slice(lastUserOrAssistantIndex + 1)
    .filter((m) => m.role === 'system')
    .map((m) => `[${m.content}]`)

  return pendingSystemNotes.length > 0 ? `${pendingSystemNotes.join('\n')}\n\n${userMessage}` : userMessage
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/agent/resolveTurnMessage.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/resolveTurnMessage.ts tests/agent/resolveTurnMessage.test.ts
git commit -m "feat: add turn message resolver for pending manual-edit notes"
```

---

### Task 10: Turn orchestrator and event bus

The integration piece: spawns `claude -p`, enforces the 5-minute idle watchdog, applies the session-id lifecycle rules, persists chat messages, and publishes events for the SSE route (Task 12) to relay. Per the design's testing approach, an LLM's tool-calling behavior isn't meaningfully unit-testable — this task is verified manually against a real `claude -p` run.

**Files:**
- Create: `src/agent/turnEvents.ts`
- Create: `src/agent/runTurn.ts`

**Interfaces:**
- Consumes: `buildMcpConfig` (Task 8), `createStreamJsonParser` (Task 7), `resolveTurnMessage` (Task 9), `addChatMessage`/`listChatMessages` (Task 3), `getSession`/`setClaudeSessionId`/`clearClaudeSessionId` (Task 2).
- Produces: `getSessionEmitter(sessionId): EventEmitter`, `publishTurnEvent(sessionId, event)`, `runTurn(db, sessionId, userMessage, databasePath, onEvent): ChatMessage`, type `TurnEvent`.

- [ ] **Step 1: Write `src/agent/turnEvents.ts`**

```typescript
import { EventEmitter } from 'node:events'

const emitters = new Map<number, EventEmitter>()

export function getSessionEmitter(sessionId: number): EventEmitter {
  let emitter = emitters.get(sessionId)
  if (!emitter) {
    emitter = new EventEmitter()
    emitters.set(sessionId, emitter)
  }
  return emitter
}

export function publishTurnEvent(sessionId: number, event: unknown): void {
  getSessionEmitter(sessionId).emit('turn-event', event)
}
```

- [ ] **Step 2: Write `src/agent/runTurn.ts`**

```typescript
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import readline from 'node:readline'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'
import { addChatMessage, listChatMessages, type ChatMessage } from '../mutations/chatMessages'
import { getSession, setClaudeSessionId, clearClaudeSessionId } from '../mutations/sessions'
import { buildMcpConfig } from './buildMcpConfig'
import { createStreamJsonParser } from './parseStreamJson'
import { resolveTurnMessage } from './resolveTurnMessage'

type Db = BetterSQLite3Database<typeof schema>

const TIMEOUT_MS = 5 * 60 * 1000

const SYSTEM_PROMPT =
  'You are an ERD-building assistant embedded in a personal tool. The user describes a data model in conversation; ' +
  'use the provided erd tools to incrementally build an entity-relationship diagram that matches what they describe. ' +
  'Call get_schema first if you need to see the current state. Give relationships a short, plain-language aiComment ' +
  'describing what the relationship means. You have no capabilities beyond the provided erd tools in this session.'

const ALLOWED_TOOLS = [
  'mcp__erd__get_schema',
  'mcp__erd__add_table',
  'mcp__erd__rename_table',
  'mcp__erd__delete_table',
  'mcp__erd__add_field',
  'mcp__erd__rename_field',
  'mcp__erd__update_field',
  'mcp__erd__delete_field',
  'mcp__erd__add_relationship',
  'mcp__erd__update_relationship',
  'mcp__erd__delete_relationship',
].join(',')

export type TurnEvent =
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; message: string }

export function runTurn(
  db: Db,
  sessionId: number,
  rawUserMessage: string,
  databasePath: string,
  onEvent: (event: TurnEvent) => void,
): ChatMessage {
  const session = getSession(db, sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)

  // Read history and resolve pending system notes BEFORE inserting this turn's user
  // message -- otherwise this message would immediately become the "last user message"
  // and resolveTurnMessage's pending-notes window would always be empty.
  const priorMessages = listChatMessages(db, sessionId)
  const resolvedMessage = resolveTurnMessage(priorMessages, rawUserMessage)
  const userMessageRow = addChatMessage(db, sessionId, 'user', rawUserMessage)

  const isFirstTurn = !session.claudeSessionId
  const claudeSessionId = session.claudeSessionId ?? randomUUID()
  if (isFirstTurn) {
    setClaudeSessionId(db, sessionId, claudeSessionId)
  }

  const mcpConfig = buildMcpConfig(sessionId, databasePath)

  const args = [
    '-p',
    resolvedMessage,
    isFirstTurn ? '--session-id' : '--resume',
    claudeSessionId,
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    mcpConfig,
    '--strict-mcp-config',
    '--allowedTools',
    ALLOWED_TOOLS,
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--system-prompt',
    SYSTEM_PROMPT,
  ]

  const child = spawn('claude', args, { cwd: process.cwd() })
  const parser = createStreamJsonParser()
  const rl = readline.createInterface({ input: child.stdout })

  let streamedAnything = false
  let settled = false

  const watchdog = setTimeout(() => {
    if (settled) return
    child.kill('SIGTERM')
    finish({ type: 'turn_error', message: 'The AI stopped responding and was cancelled after 5 minutes of inactivity.' })
  }, TIMEOUT_MS)

  function resetWatchdog() {
    watchdog.refresh()
  }

  function finish(event: TurnEvent) {
    if (settled) return
    settled = true
    clearTimeout(watchdog)

    if (event.type === 'turn_error' && !streamedAnything) {
      clearClaudeSessionId(db, sessionId)
    }

    if (event.type === 'turn_complete' && event.text) {
      addChatMessage(db, sessionId, 'assistant', event.text)
    } else if (event.type === 'turn_error') {
      addChatMessage(db, sessionId, 'system', event.message)
    }

    onEvent(event)
  }

  rl.on('line', (line) => {
    resetWatchdog()
    streamedAnything = true

    for (const evt of parser.parseLine(line)) {
      if (evt.kind === 'tool_step') {
        addChatMessage(db, sessionId, 'system', evt.stepText)
        onEvent({ type: 'tool_step', toolName: evt.toolName, stepText: evt.stepText })
      } else if (evt.kind === 'turn_result') {
        finish(evt.success ? { type: 'turn_complete', text: evt.text } : { type: 'turn_error', message: evt.text || 'The AI turn ended with an error.' })
      }
    }
  })

  child.on('error', () => {
    finish({ type: 'turn_error', message: 'Failed to start the AI agent process.' })
  })

  child.on('close', (code) => {
    if (!settled) {
      finish(
        code === 0
          ? { type: 'turn_complete', text: '' }
          : { type: 'turn_error', message: `The AI process exited unexpectedly (code ${code}).` },
      )
    }
  })

  return userMessageRow
}
```

Note `runTurn` now persists the user's message itself (using the raw, unprefixed text) and returns that row — it no longer relies on the caller to have inserted it first. This is what makes the read-before-insert ordering above correct: the caller (Task 11's `sendMessageFn`) must NOT insert the user message itself; it just calls `runTurn` and uses its return value.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Manually verify against a real turn**

```bash
npx tsx scripts/seed-demo.ts
```

Note the printed session id, then run a scratch script (delete it after):

```typescript
// scripts/_manual-run-turn.ts -- delete after running
import { db } from '../src/db/client'
import { runTurn } from '../src/agent/runTurn'

const sessionId = Number(process.argv[2])
runTurn(db, sessionId, 'Add a products table with a name and price field.', './auto-erd.db', (event) => {
  console.log(JSON.stringify(event))
})
```

```bash
npx tsx scripts/_manual-run-turn.ts <sessionId-from-seed-demo>
```

Expected: `tool_step` events print for each tool call (e.g. add_table, add_field), followed by a `turn_complete` event. Then confirm in a separate check that the table actually landed:

```bash
npx tsx -e "
import { db } from './src/db/client';
import { getFullSchema } from './src/mutations/getFullSchema';
console.log(JSON.stringify(getFullSchema(db, <sessionId>), null, 2));
"
```

Expected: the `products` table with `name` and `price` fields is present. Delete `scripts/_manual-run-turn.ts` once confirmed.

- [ ] **Step 5: Commit**

```bash
git add src/agent/turnEvents.ts src/agent/runTurn.ts
git commit -m "feat: add turn orchestrator spawning claude -p per chat turn"
```

---

### Task 11: Chat server functions

**Files:**
- Create: `src/server-fns/chat.ts`

**Interfaces:**
- Consumes: `listChatMessages` (Task 3), `runTurn` (Task 10), `publishTurnEvent` (Task 10).
- Produces: `sendMessageFn`, `listChatMessagesFn`.

**Important:** `runTurn` (Task 10) persists the user's message itself and returns that row — it reads chat history to resolve pending manual-edit system notes *before* inserting the new message, so nothing else may insert that message first. Do **not** call `addChatMessage` for the user's message in this file; just call `runTurn` and return its result.

- [ ] **Step 1: Write `src/server-fns/chat.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { db } from '../db/client'
import { listChatMessages } from '../mutations/chatMessages'
import { runTurn } from '../agent/runTurn'
import { publishTurnEvent } from '../agent/turnEvents'

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'auto-erd.db')

export const listChatMessagesFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => listChatMessages(db, data.sessionId))

export const sendMessageFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), content: z.string().min(1) }))
  .handler(async ({ data }) => {
    return runTurn(db, data.sessionId, data.content, DATABASE_PATH, (event) => {
      publishTurnEvent(data.sessionId, event)
    })
  })
```

`runTurn` is a synchronous function (not a Promise): it does its DB reads/writes synchronously (better-sqlite3 is sync), then starts the `claude -p` subprocess and returns immediately — it does not wait for the subprocess to finish. This is what makes "turns survive tab close" work: the server function returns as soon as the turn is kicked off, and the turn continues running server-side regardless of the HTTP request's lifecycle, with progress relayed only through `onEvent`/SSE from then on.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server-fns/chat.ts
git commit -m "feat: add chat server functions"
```

---

### Task 12: SSE route for live turn events

Confirmed via spike: this exact `createFileRoute(path)({ server: { handlers: { GET: ... } } })` shape, returning a `Response` wrapping a `ReadableStream`, genuinely streams `text/event-stream` through this version of TanStack Start.

**Files:**
- Create: `src/routes/api.sessions.$sessionId.events.ts`

**Interfaces:**
- Consumes: `getSessionEmitter` (Task 10).
- Produces: `GET /api/sessions/:sessionId/events`, an SSE stream of `TurnEvent` JSON payloads.

- [ ] **Step 1: Write `src/routes/api.sessions.$sessionId.events.ts`**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { getSessionEmitter } from '../agent/turnEvents'

export const Route = createFileRoute('/api/sessions/$sessionId/events')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const sessionId = Number(params.sessionId)
        const emitter = getSessionEmitter(sessionId)

        let listener: (event: unknown) => void = () => {}
        const stream = new ReadableStream({
          start(controller) {
            listener = (event) => {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
            }
            emitter.on('turn-event', listener)
          },
          cancel() {
            emitter.off('turn-event', listener)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
```

- [ ] **Step 2: Regenerate routes and verify manually**

```bash
npm run generate-routes
npm run dev
```

In another terminal, with the dev server running:

```bash
curl -N http://localhost:3000/api/sessions/1/events &
```

Then trigger a turn for session 1 (e.g. via the manual script pattern from Task 10, or once Task 17 lands, via the actual UI) and confirm `data: {...}` lines appear on the `curl -N` terminal as the turn progresses. Stop the curl (`kill %1`) and the dev server once confirmed.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.sessions.\$sessionId.events.ts src/routeTree.gen.ts
git commit -m "feat: add SSE route streaming live turn events"
```

---

### Task 13: Root layout and session sidebar

Restructures the app shell: a persistent left sidebar (session list + "+ New session") next to the routed content, replacing the old standalone dashboard-only layout. Verified manually (layout/visual change, per design's testing approach).

**Files:**
- Create: `src/components/sidebar/SessionSidebar.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/sessions.$sessionId.tsx` (container class only, from `h-screen w-screen` to `h-full w-full` so it fills the space next to the sidebar instead of overflowing past it)

**Interfaces:**
- Consumes: `listSessionsFn`, `createSessionFn` (Plan 1, `src/server-fns/sessions.ts`).
- Produces: `SessionSidebar` component, rendered globally from `__root.tsx`.

- [ ] **Step 1: Write `src/components/sidebar/SessionSidebar.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { listSessionsFn, createSessionFn } from '../../server-fns/sessions'
import type { SessionSummary } from '../../mutations/sessions'

export function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const activeSessionId = params.sessionId

  const listSessions = useServerFn(listSessionsFn)
  const createSession = useServerFn(createSessionFn)

  useEffect(() => {
    listSessions().then(setSessions)
  }, [])

  async function handleCreate() {
    const session = await createSession({ data: { name: `Session ${sessions.length + 1}` } })
    setSessions(await listSessions())
    navigate({ to: '/sessions/$sessionId', params: { sessionId: String(session.id) } })
  }

  return (
    <div className="w-56 shrink-0 h-screen bg-slate-950 border-r border-slate-800 flex flex-col">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleCreate}
          className="w-full bg-teal-500 text-slate-950 px-3 py-2 rounded text-sm font-medium hover:bg-teal-400"
        >
          + New session
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((session) => (
          <li key={session.id}>
            <Link
              to="/sessions/$sessionId"
              params={{ sessionId: String(session.id) }}
              className={`block rounded px-2 py-2 text-sm truncate ${
                activeSessionId === String(session.id)
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              {session.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `src/routes/__root.tsx`**

Modify the `RootDocument` function's body content:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { SessionSidebar } from '../components/sidebar/SessionSidebar'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Auto ERD' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }}>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <div className="flex h-screen w-screen overflow-hidden">
          <SessionSidebar />
          <div className="flex-1 h-screen overflow-hidden">{children}</div>
        </div>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[{ name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Simplify `src/routes/index.tsx`**

The session list now lives in the sidebar, so the dashboard route becomes a lightweight welcome/empty state:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-500">
      <p>Select a session from the sidebar, or create a new one to get started.</p>
    </div>
  )
}
```

- [ ] **Step 4: Adjust `src/routes/sessions.$sessionId.tsx` container class**

Change the outermost `<div>`'s className from `h-screen w-screen flex flex-col bg-slate-950` to `h-full w-full flex flex-col bg-slate-950` (so it fills the space next to the sidebar instead of `100vw`, which would overflow past it).

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Expected: sidebar visible on the left on every route, listing sessions with the active one highlighted; "+ New session" creates a session and navigates into it; the dashboard (`/`) shows the welcome message next to the sidebar, not overlapping it. Stop the server.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/sidebar/SessionSidebar.tsx src/routes/__root.tsx src/routes/index.tsx src/routes/sessions.\$sessionId.tsx
git commit -m "feat: add persistent session sidebar and simplify dashboard"
```

---

### Task 14: Inline add-table UI (remove `window.prompt`)

Replaces the `window.prompt()`-based "+ Add table" button with an inline on-canvas control, consistent with the chat-first, dialog-free UI direction. Field creation already uses inline UI (the "+ field" row inside `TableNode`) from Plan 1 — this task only touches table creation.

**Files:**
- Modify: `src/components/erd/ErdCanvas.tsx`
- Modify: `src/routes/sessions.$sessionId.tsx`

**Interfaces:**
- Consumes: `addTableFn` (Task 4).
- Produces: an on-canvas "+ Add table" control replacing the toolbar button + `window.prompt()`.

- [ ] **Step 1: Add an inline add-table control to `ErdCanvas.tsx`**

Add a new prop `onAddTable: (name: string) => void` to `ErdCanvasProps`, and render a small floating control (using React Flow's `Panel` component) with a text input:

```tsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Panel,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react'
```

(add `Panel` to the existing `@xyflow/react` import)

Add the prop to `ErdCanvasProps`:

```typescript
export interface ErdCanvasProps {
  schema: FullSchema
  onAddTable: (name: string) => void
  onAddField: (tableId: number) => void
  onConnect: (fromFieldId: number, toFieldId: number) => void
  onRenameTable: (tableId: number, name: string) => void
  onRenameField: (fieldId: number, name: string) => void
  onMoveTable: (tableId: number, positionX: number, positionY: number) => void
}
```

Update the function signature to accept it, add local input state, and render the panel inside `<ReactFlow>`:

```tsx
export function ErdCanvas({
  schema,
  onAddTable,
  onAddField,
  onConnect,
  onRenameTable,
  onRenameField,
  onMoveTable,
}: ErdCanvasProps) {
  const [newTableName, setNewTableName] = useState('')
  // ...(existing baseNodes/nodes/edges/handlers unchanged)...

  function handleAddTable() {
    if (!newTableName.trim()) return
    onAddTable(newTableName.trim())
    setNewTableName('')
  }

  return (
    <div className="h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        fitView
      >
        <Background color="#1e293b" gap={24} />
        <Panel position="top-left" className="flex gap-2">
          <input
            value={newTableName}
            onChange={(e) => setNewTableName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
            placeholder="New table name"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            onClick={handleAddTable}
            className="bg-teal-500 text-slate-950 px-3 py-1 rounded text-sm font-medium hover:bg-teal-400"
          >
            + Add table
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Wire it up in `src/routes/sessions.$sessionId.tsx`**

Replace `handleAddTable` (the `window.prompt`-based one) with:

```typescript
  async function handleAddTable(name: string) {
    await addTable({ data: { sessionId: Number(sessionId), name } })
    await refetch()
  }
```

Remove the old toolbar `<button onClick={handleAddTable}>+ Add table</button>` from the JSX (it's now on-canvas), and pass `onAddTable={handleAddTable}` to `<ErdCanvas>`.

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

Expected: opening a session shows an inline "+ Add table" input/button at the top-left of the canvas (no `window.prompt()` dialog anywhere); typing a name and pressing Enter or clicking the button adds the table. Stop the server.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/erd/ErdCanvas.tsx src/routes/sessions.\$sessionId.tsx
git commit -m "feat: replace window.prompt table creation with inline canvas control"
```

---

### Task 15: Add relationship connection guardrails

Manual drag-to-connect relationship creation stays (it was never removed from `ErdCanvas.tsx`/`sessions.$sessionId.tsx` — those still have Plan 1's original `onConnect`/`handleConnect` wiring). What's missing is validation: today, any field can be connected to any other field an unlimited number of times, in either direction, including to itself. This task adds guardrails at the mutation layer — the single place both manual UI edits and AI `add_relationship` tool calls go through — plus a client-side check for immediate feedback during dragging.

Guardrails: a field may not relate to itself, and two fields may only have one relationship between them (checked in both directions — if `users.id → orders.user_id` exists, `orders.user_id → users.id` is also rejected). Self-referencing tables remain valid: two *different* fields on the same table (e.g. `employees.manager_id` and `employees.id`) can still be related.

This task also restores `addRelationshipFn` in `src/server-fns/schema.ts`, which Task 4 removed on the (now-reversed) assumption that relationships would become AI-only — restoring it resolves the one known, deferred typecheck error in `sessions.$sessionId.tsx` that's persisted since Task 4.

**Files:**
- Modify: `src/mutations/relationships.ts`
- Modify: `src/server-fns/schema.ts`
- Modify: `src/components/erd/ErdCanvas.tsx`
- Test: `tests/mutations/relationships.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `addRelationship` now throws an `Error` for self-connections and duplicate field pairs (unchanged signature otherwise); `addRelationshipFn` restored; `ErdCanvas` gains a client-side `isValidConnection` check.

- [ ] **Step 1: Write the failing tests**

Read the current `tests/mutations/relationships.test.ts` first, then add `usersTableId` to the `beforeEach` capture and add four new tests. The full file becomes:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../../src/db/client'
import { createSession } from '../../src/mutations/sessions'
import { addTable } from '../../src/mutations/tables'
import { addField } from '../../src/mutations/fields'
import { addRelationship, updateRelationship, deleteRelationship } from '../../src/mutations/relationships'

describe('relationship mutations', () => {
  let db: ReturnType<typeof createDb>
  let sessionId: number
  let usersTableId: number
  let userIdField: number
  let orderUserIdField: number

  beforeEach(() => {
    db = createDb(':memory:')
    sessionId = createSession(db, 'Session').id
    const users = addTable(db, sessionId, 'users')
    const orders = addTable(db, sessionId, 'orders')
    usersTableId = users.id
    userIdField = addField(db, users.id, 'id', 'uuid', true).id
    orderUserIdField = addField(db, orders.id, 'user_id', 'uuid', false, true).id
  })

  it('adds a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many', 'A user has many orders')
    expect(rel.cardinality).toBe('one-to-many')
    expect(rel.aiComment).toBe('A user has many orders')
  })

  it('updates a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    const updated = updateRelationship(db, rel.id, { aiComment: 'Updated comment' })
    expect(updated.aiComment).toBe('Updated comment')
  })

  it('deletes a relationship', () => {
    const rel = addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    deleteRelationship(db, rel.id)
    expect(updateRelationship(db, rel.id, { aiComment: 'x' })).toBeUndefined()
  })

  it('rejects a relationship from a field to itself', () => {
    expect(() => addRelationship(db, sessionId, userIdField, userIdField, 'one-to-many')).toThrow()
  })

  it('rejects a duplicate relationship between the same two fields', () => {
    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    expect(() => addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')).toThrow()
  })

  it('rejects a duplicate relationship in the reverse direction', () => {
    addRelationship(db, sessionId, userIdField, orderUserIdField, 'one-to-many')
    expect(() => addRelationship(db, sessionId, orderUserIdField, userIdField, 'one-to-many')).toThrow()
  })

  it('allows a self-referencing relationship between two different fields on the same table', () => {
    const managerIdField = addField(db, usersTableId, 'manager_id', 'uuid', false, true).id
    expect(() => addRelationship(db, sessionId, userIdField, managerIdField, 'one-to-many')).not.toThrow()
  })
})
```

(The first three tests are unchanged from Plan 1/Task 5 — only the `beforeEach` and the four new tests at the bottom are new.)

- [ ] **Step 2: Run tests to verify the four new ones fail**

```bash
npx vitest run tests/mutations/relationships.test.ts
```

Expected: the three pre-existing tests PASS, the four new ones FAIL (no validation exists yet).

- [ ] **Step 3: Add validation to `addRelationship` in `src/mutations/relationships.ts`**

Replace the existing `addRelationship` function with this version (leave `updateRelationship`/`deleteRelationship` untouched):

```typescript
export function addRelationship(
  db: Db,
  sessionId: number,
  fromFieldId: number,
  toFieldId: number,
  cardinality: Cardinality,
  aiComment = '',
): Relationship {
  if (fromFieldId === toFieldId) {
    throw new Error('A field cannot have a relationship with itself.')
  }

  const existingForSession = db.select().from(relationships).where(eq(relationships.sessionId, sessionId)).all()
  const isDuplicate = existingForSession.some(
    (rel) =>
      (rel.fromFieldId === fromFieldId && rel.toFieldId === toFieldId) ||
      (rel.fromFieldId === toFieldId && rel.toFieldId === fromFieldId),
  )
  if (isDuplicate) {
    throw new Error('These two fields already have a relationship.')
  }

  const [row] = db
    .insert(relationships)
    .values({ sessionId, fromFieldId, toFieldId, cardinality, aiComment })
    .returning()
    .all()
  return row
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/mutations/relationships.test.ts
```

Expected: PASS (7 tests total).

- [ ] **Step 5: Restore `addRelationshipFn` in `src/server-fns/schema.ts`**

Add `addRelationship` to the existing `../mutations/relationships` import (it currently only imports types/other functions there — check what's already imported and add to it, don't duplicate the import line), then add:

```typescript
export const addRelationshipFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      sessionId: z.number(),
      fromFieldId: z.number(),
      toFieldId: z.number(),
      cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
    }),
  )
  .handler(async ({ data }) =>
    addRelationship(db, data.sessionId, data.fromFieldId, data.toFieldId, data.cardinality),
  )
```

- [ ] **Step 6: Add a client-side `isValidConnection` check to `ErdCanvas.tsx`**

This gives immediate visual feedback during a drag (the connection line won't "snap" if invalid) instead of only failing after a round-trip to the server. Add inside the `ErdCanvas` function body, above the `return`:

```typescript
  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return false
      const fromFieldId = Number(connection.sourceHandle.replace('field-', ''))
      const toFieldId = Number(connection.targetHandle.replace('field-', ''))
      if (fromFieldId === toFieldId) return false
      return !schema.relationships.some(
        (rel) =>
          (rel.fromFieldId === fromFieldId && rel.toFieldId === toFieldId) ||
          (rel.fromFieldId === toFieldId && rel.toFieldId === fromFieldId),
      )
    },
    [schema.relationships],
  )
```

Add `isValidConnection={isValidConnection}` to the `<ReactFlow>` element (alongside the existing `onConnect={handleConnect}`).

- [ ] **Step 7: Verify manually**

```bash
npm run dev
```

Seed a demo session (`npx tsx scripts/seed-demo.ts`, which already creates one `users.id → orders.user_id` relationship) and open it. Expected: dragging to recreate the same connection (in either direction) doesn't visually connect; dragging a field's handle to itself doesn't visually connect; dragging between two fields that aren't yet related still works and persists after reload. Stop the server.

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

Expected: no errors — including the `addRelationshipFn` error in `sessions.$sessionId.tsx` that's been known and deferred since Task 4, since restoring the export resolves it.

- [ ] **Step 9: Commit**

```bash
git add src/mutations/relationships.ts src/server-fns/schema.ts src/components/erd/ErdCanvas.tsx tests/mutations/relationships.test.ts
git commit -m "feat: add relationship connection guardrails (no self-links, no duplicate pairs)"
```

---

### Task 16: `useSessionEvents` hook and chat components

**Files:**
- Create: `src/hooks/useSessionEvents.ts`
- Create: `src/components/chat/ChatMessageBubble.tsx`
- Create: `src/components/chat/ChatPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/:sessionId/events` (Task 12), `ChatMessage` type (Task 3).
- Produces: `useSessionEvents(sessionId, onEvent)`, `ChatPanel` component taking `sessionId`, `initialMessages`, and `onMessagesChange` (or managing its own state — see Step 3).

- [ ] **Step 1: Write `src/hooks/useSessionEvents.ts`**

```typescript
import { useEffect, useRef } from 'react'

export function useSessionEvents(sessionId: number, onEvent: (event: unknown) => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const source = new EventSource(`/api/sessions/${sessionId}/events`)
    source.onmessage = (e) => {
      handlerRef.current(JSON.parse(e.data))
    }
    return () => source.close()
  }, [sessionId])
}
```

- [ ] **Step 2: Write `src/components/chat/ChatMessageBubble.tsx`**

```tsx
import type { ChatMessage } from '../../mutations/chatMessages'

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[85%] bg-teal-500/20 border border-teal-400/30 text-slate-100 rounded-lg px-3 py-2 text-sm">
        {message.content}
      </div>
    )
  }

  if (message.role === 'system') {
    return <div className="text-xs text-slate-500 px-1">{message.content}</div>
  }

  return (
    <div className="mr-auto max-w-[85%] bg-slate-800/70 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm">
      {message.content}
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/chat/ChatPanel.tsx`**

This component owns its own message list (seeded from `initialMessages`, appended to live via SSE + the send call), tracks whether a turn is in flight to disable input, and renders the centered-empty-state vs. bottom-bar layouts described in the design.

```tsx
import { useEffect, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { sendMessageFn } from '../../server-fns/chat'
import { useSessionEvents } from '../../hooks/useSessionEvents'
import { ChatMessageBubble } from './ChatMessageBubble'
import type { ChatMessage } from '../../mutations/chatMessages'

type TurnEvent =
  | { type: 'tool_step'; toolName: string; stepText: string }
  | { type: 'turn_complete'; text: string }
  | { type: 'turn_error'; message: string }

export interface ChatPanelProps {
  sessionId: number
  initialMessages: ChatMessage[]
  onSchemaMayHaveChanged: () => void
}

export function ChatPanel({ sessionId, initialMessages, onSchemaMayHaveChanged }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [draft, setDraft] = useState('')
  const [turnInFlight, setTurnInFlight] = useState(false)
  const nextLocalId = useRef(-1)

  useEffect(() => {
    setMessages(initialMessages)
  }, [sessionId])

  const sendMessage = useServerFn(sendMessageFn)

  useSessionEvents(sessionId, (raw) => {
    const event = raw as TurnEvent
    if (event.type === 'tool_step') {
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.stepText, createdAt: '' },
      ])
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_complete') {
      if (event.text) {
        setMessages((prev) => [
          ...prev,
          { id: nextLocalId.current--, sessionId, role: 'assistant', content: event.text, createdAt: '' },
        ])
      }
      setTurnInFlight(false)
      onSchemaMayHaveChanged()
    } else if (event.type === 'turn_error') {
      setMessages((prev) => [
        ...prev,
        { id: nextLocalId.current--, sessionId, role: 'system', content: event.message, createdAt: '' },
      ])
      setTurnInFlight(false)
    }
  })

  async function handleSend() {
    const content = draft.trim()
    if (!content || turnInFlight) return
    setDraft('')
    setTurnInFlight(true)
    const message = await sendMessage({ data: { sessionId, content } })
    setMessages((prev) => [...prev, message])
  }

  const hasMessages = messages.length > 0

  if (!hasMessages) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-lg px-6 pointer-events-auto">
          <p className="text-center text-slate-400 mb-3 text-sm">Describe the system you want to model...</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="e.g. Users can place orders, each order has multiple items..."
              className="flex-1 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
            />
            <button
              onClick={handleSend}
              disabled={turnInFlight}
              className="bg-teal-500 text-slate-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-400 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-teal-400/25 bg-slate-950/55 backdrop-blur-md shadow-lg overflow-hidden">
        <div className="max-h-64 overflow-y-auto px-3 pt-3 space-y-2 [mask-image:linear-gradient(to_bottom,transparent,black_16px)]">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </div>
        <div className="flex gap-2 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={turnInFlight}
            placeholder={turnInFlight ? 'Thinking...' : 'Message the AI...'}
            className="flex-1 bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={turnInFlight}
            className="bg-teal-500 text-slate-950 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-400 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
```

Note: `onSchemaMayHaveChanged` is called after every `tool_step` and `turn_complete` — the session route (Task 17) uses it to refetch the schema so the canvas reflects tool calls live, without `ChatPanel` needing to know anything about `FullSchema`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSessionEvents.ts src/components/chat/ChatMessageBubble.tsx src/components/chat/ChatPanel.tsx
git commit -m "feat: add chat panel with SSE-driven live updates"
```

---

### Task 17: Wire the chat panel into the session view

Final integration task: the session route loads initial chat history, renders `ChatPanel` floating over the full-bleed canvas, and refetches the schema when the chat signals it may have changed.

**Files:**
- Modify: `src/routes/sessions.$sessionId.tsx`

**Interfaces:**
- Consumes: `listChatMessagesFn` (Task 11), `ChatPanel` (Task 16).

- [ ] **Step 1: Update the route loader to also fetch chat history**

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { getFullSchemaFn, addTableFn, addFieldFn, addRelationshipFn, renameTableFn, renameFieldFn, updateTablePositionFn } from '../server-fns/schema'
import { exportDdlFn } from '../server-fns/export'
import { listChatMessagesFn } from '../server-fns/chat'
import { ErdCanvas } from '../components/erd/ErdCanvas'
import { ChatPanel } from '../components/chat/ChatPanel'
import type { FullSchema } from '../mutations/getFullSchema'

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const sessionId = Number(params.sessionId)
    const [schema, messages] = await Promise.all([
      getFullSchemaFn({ data: { sessionId } }),
      listChatMessagesFn({ data: { sessionId } }),
    ])
    return { schema, messages }
  },
  component: SessionView,
})

function SessionView() {
  const initialData = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  const [schema, setSchema] = useState<FullSchema>(initialData.schema)

  const addTable = useServerFn(addTableFn)
  const addField = useServerFn(addFieldFn)
  const addRelationship = useServerFn(addRelationshipFn)
  const renameTable = useServerFn(renameTableFn)
  const renameField = useServerFn(renameFieldFn)
  const updateTablePosition = useServerFn(updateTablePositionFn)
  const refreshSchema = useServerFn(getFullSchemaFn)
  const exportDdl = useServerFn(exportDdlFn)

  async function refetch() {
    setSchema(await refreshSchema({ data: { sessionId: Number(sessionId) } }))
  }

  async function handleAddTable(name: string) {
    await addTable({ data: { sessionId: Number(sessionId), name } })
    await refetch()
  }

  async function handleAddField(tableId: number) {
    const name = window.prompt('Field name')
    if (!name) return
    const type = window.prompt('Field type (e.g. text, integer, uuid)') ?? 'text'
    await addField({ data: { tableId, name, type } })
    await refetch()
  }

  async function handleConnect(fromFieldId: number, toFieldId: number) {
    try {
      await addRelationship({
        data: { sessionId: Number(sessionId), fromFieldId, toFieldId, cardinality: 'one-to-many' },
      })
      await refetch()
    } catch {
      // Rejected by a guardrail (self-connection or duplicate pair, see Task 15).
      // ErdCanvas's isValidConnection already prevents this in the common case;
      // this catch only matters for a race with a concurrent AI-driven change.
    }
  }

  async function handleRenameTable(tableId: number, name: string) {
    await renameTable({ data: { tableId, name } })
    await refetch()
  }

  async function handleRenameField(fieldId: number, name: string) {
    await renameField({ data: { fieldId, name } })
    await refetch()
  }

  async function handleMoveTable(tableId: number, positionX: number, positionY: number) {
    await updateTablePosition({ data: { tableId, positionX, positionY } })
  }

  async function handleExport() {
    const ddl = await exportDdl({ data: { sessionId: Number(sessionId) } })
    const blob = new Blob([ddl], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schema-${sessionId}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-950">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleExport}
          className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded text-sm font-medium hover:bg-slate-700"
        >
          Export SQL
        </button>
      </div>
      <div className="flex-1 relative">
        <ErdCanvas
          schema={schema}
          onAddTable={handleAddTable}
          onAddField={handleAddField}
          onConnect={handleConnect}
          onRenameTable={handleRenameTable}
          onRenameField={handleRenameField}
          onMoveTable={handleMoveTable}
        />
        <ChatPanel sessionId={Number(sessionId)} initialMessages={initialData.messages} onSchemaMayHaveChanged={refetch} />
      </div>
    </div>
  )
}
```

Note `handleAddField` still uses `window.prompt()` for field name/type — that's the existing Plan-1 behavior and out of scope for this plan (only table creation moves off dialogs per the design; field creation is handled later in Task 18). `ChatPanel` is positioned inside a `relative` wrapper (`flex-1 relative`) around `ErdCanvas` so its `absolute` positioning is relative to the canvas area, not the whole viewport.

- [ ] **Step 2: Manually verify the full loop end to end**

```bash
npm run dev
```

From the sidebar, create a new session. Expected: centered "Describe the system you want to model..." prompt over an empty canvas. Type a description (e.g. "Users can place orders, each order has multiple order items") and send. Expected:
- The prompt animates/switches to the bottom floating bar.
- `system`-role step bubbles appear as the AI calls tools (e.g. "Added table `users`").
- The canvas updates live with new tables as they're created (no manual refresh needed).
- A final assistant message bubble appears once the turn completes.
- Relationships the AI creates show up as edges with working hover tooltips.
- Dragging a table still works (from the earlier bug fix); manually dragging between two unrelated fields creates a relationship, but re-dragging the same pair (either direction) or a field to itself does nothing (Task 15's guardrails).

Send a second message referencing the existing schema (e.g. "actually rename orders to purchases") and confirm the AI's response reflects awareness of the existing tables (proving `--resume` continuity works end to end, not just in the Task 10 spike).

- [ ] **Step 3: Typecheck and run the full test suite**

```bash
npm run typecheck
npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/sessions.\$sessionId.tsx
git commit -m "feat: wire chat panel into session view, completing the chat/agent loop"
```

---

### Task 18: Inline field creation (remove `window.prompt` from add-field)

Task 17 wired up field creation using Plan 1's existing `window.prompt()`-based flow so the loop was complete end to end. This task replaces it with the inline form the design calls for ("an `+ add field` row inside the table node"), matching Task 14's treatment of table creation.

**Files:**
- Modify: `src/components/erd/TableNode.tsx`
- Modify: `src/components/erd/ErdCanvas.tsx`
- Modify: `src/routes/sessions.$sessionId.tsx`

**Interfaces:**
- Consumes: `addFieldFn` (Task 4).
- Produces: `TableNodeData.onAddField` signature changes from `(tableId: number) => void` to `(tableId: number, name: string, type: string) => void`.

- [ ] **Step 1: Replace the `+ field` button with an inline form in `TableNode.tsx`**

Add a new component above `TableNode` in the same file:

```tsx
function AddFieldRow({ tableId, onAdd }: { tableId: number; onAdd: (tableId: number, name: string, type: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('text')

  function commit() {
    if (!name.trim()) return
    onAdd(tableId, name.trim(), type.trim() || 'text')
    setName('')
    setType('text')
    setAdding(false)
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)} className="text-teal-400 text-xs hover:underline">
        + field
      </button>
    )
  }

  return (
    <div className="flex gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="name"
        className="w-20 bg-slate-950 border border-teal-400 rounded px-1 text-xs text-slate-100"
      />
      <input
        value={type}
        onChange={(e) => setType(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder="type"
        className="w-16 bg-slate-950 border border-teal-400 rounded px-1 text-xs text-slate-100"
      />
      <button onClick={commit} className="text-teal-400 text-xs hover:underline">
        add
      </button>
    </div>
  )
}
```

Update `TableNodeData.onAddField`'s type:

```typescript
  onAddField?: (tableId: number, name: string, type: string) => void
```

Replace the existing `+ field` `<button>` in `TableNode`'s render with:

```tsx
              <AddFieldRow tableId={data.tableId} onAdd={data.onAddField ?? (() => {})} />
```

- [ ] **Step 2: Update `ErdCanvasProps` in `ErdCanvas.tsx`**

Change the `onAddField` prop type to match:

```typescript
  onAddField: (tableId: number, name: string, type: string) => void
```

- [ ] **Step 3: Update `handleAddField` in `src/routes/sessions.$sessionId.tsx`**

Replace the `window.prompt()`-based version from Task 17 with:

```typescript
  async function handleAddField(tableId: number, name: string, type: string) {
    await addField({ data: { tableId, name, type } })
    await refetch()
  }
```

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```

Expected: clicking "+ field" on a table shows inline name/type inputs (no dialog); typing a name and pressing Enter (or clicking "add") adds the field and updates the canvas. Stop the server.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/erd/TableNode.tsx src/components/erd/ErdCanvas.tsx src/routes/sessions.\$sessionId.tsx
git commit -m "feat: replace window.prompt field creation with inline form"
```

---

### Task 19: Delete affordance for tables and fields

The design calls for "a delete affordance on hover" as part of moving manual editing off native dialogs. Plan 1 never built any table/field delete UI at all (only the server-fns exist). This task adds a small hover-revealed "×" button to the table header and each field row.

**Files:**
- Modify: `src/components/erd/TableNode.tsx`
- Modify: `src/components/erd/ErdCanvas.tsx`
- Modify: `src/routes/sessions.$sessionId.tsx`

**Interfaces:**
- Consumes: `deleteTableFn`, `deleteFieldFn` (Task 4).
- Produces: `TableNodeData.onDeleteTable?: (tableId: number) => void`, `TableNodeData.onDeleteField?: (fieldId: number) => void`.

- [ ] **Step 1: Add delete buttons in `TableNode.tsx`**

Add both handlers to `TableNodeData`:

```typescript
  onDeleteTable?: (tableId: number) => void
  onDeleteField?: (fieldId: number) => void
```

Change the table header `<div>` to a flex row with a hover-revealed delete button:

```tsx
      <div className="group bg-slate-800 text-slate-200 font-semibold px-3 py-1.5 rounded-t-lg flex items-center justify-between">
        <EditableText value={data.name} onCommit={(next) => data.onRenameTable?.(data.tableId, next)} />
        <button
          onClick={() => data.onDeleteTable?.(data.tableId)}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs px-1"
          title="Delete table"
        >
          ×
        </button>
      </div>
```

Add `group` to each field row's className and a delete cell before the closing `</tr>` (after the type `<td>`, before the source `<Handle>`):

```tsx
            <tr key={field.id} className="group relative text-slate-300">
```

```tsx
              <td className="px-1 py-1 w-4">
                <button
                  onClick={() => data.onDeleteField?.(field.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs"
                  title="Delete field"
                >
                  ×
                </button>
              </td>
```

- [ ] **Step 2: Thread the handlers through `ErdCanvas.tsx`**

Add both to `ErdCanvasProps`:

```typescript
  onDeleteTable: (tableId: number) => void
  onDeleteField: (fieldId: number) => void
```

Add them to the function signature and to the `data` spread in `baseNodes`:

```typescript
export function ErdCanvas({
  schema,
  onAddTable,
  onAddField,
  onConnect,
  onRenameTable,
  onRenameField,
  onDeleteTable,
  onDeleteField,
  onMoveTable,
}: ErdCanvasProps) {
  const baseNodes = useMemo(
    () =>
      schemaToNodes(schema).map((node) => ({
        ...node,
        data: { ...node.data, onAddField, onRenameTable, onRenameField, onDeleteTable, onDeleteField },
      })),
    [schema, onAddField, onRenameTable, onRenameField, onDeleteTable, onDeleteField],
  )
```

- [ ] **Step 3: Wire handlers in `src/routes/sessions.$sessionId.tsx`**

Add the two server function bindings and handlers, and pass them to `<ErdCanvas>`:

```typescript
  const deleteTable = useServerFn(deleteTableFn)
  const deleteField = useServerFn(deleteFieldFn)
```

(add `deleteTableFn, deleteFieldFn` to the existing `../server-fns/schema` import)

```typescript
  async function handleDeleteTable(tableId: number) {
    await deleteTable({ data: { tableId } })
    await refetch()
  }

  async function handleDeleteField(fieldId: number) {
    await deleteField({ data: { fieldId } })
    await refetch()
  }
```

Add `onDeleteTable={handleDeleteTable}` and `onDeleteField={handleDeleteField}` to the `<ErdCanvas>` element.

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```

Expected: hovering a table header reveals a small "×" that deletes the table (and its fields/relationships) on click; hovering a field row reveals a small "×" that deletes just that field. Stop the server.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/erd/TableNode.tsx src/components/erd/ErdCanvas.tsx src/routes/sessions.\$sessionId.tsx
git commit -m "feat: add hover delete affordance for tables and fields"
```

---

## Post-Plan Notes

- A real hydration-mismatch bug was found during this plan's design phase in `TableNode.tsx` (Handle components render invalid `<div>` children directly inside `<tr>`, which the browser silently reparents, causing a React hydration mismatch on every session load). It's unrelated to this plan's scope and was left unfixed — worth a follow-up bug-fix pass.
- Manual testing throughout this plan (Tasks 6, 10, 12, 13, 14, 15, 17, 18, 19) is intentionally lightweight (curl, direct script runs, or a single dev-server pass) rather than browser automation, per user preference established during this project's debugging work.
