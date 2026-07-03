# Export / Import Improvements — Design

## Purpose

Four additions to the existing export surface (topbar dropdown), all sharing the same "turn the current schema into a file, or a file back into a schema" theme:

1. **SQL dialect export** — the current single "Export SQL" doesn't specify a target dialect, so its output isn't valid SQL for any real database as-is.
2. **Image export** — a PNG snapshot of the diagram, for pasting into docs/tickets/chat.
3. **Relations export** — a Markdown dump of the plain-English relationship summary already computed for the on-canvas dialog.
4. **JSON export/import** — a round-trip backup/share format for a whole session. SQL DDL import (reverse-engineering an existing database's `CREATE TABLE` statements) is explicitly deferred; only JSON import ships now.

None of this touches the AI agent/chat layer (Plan 2) or the mutation functions' existing signatures — it's additive, reading the same `getFullSchema` data the DDL exporter already reads, and (for import) calling the same table/field/relationship insert paths.

## 1. SQL dialect export

### Problem

[ddl.ts](../../../src/export/ddl.ts) emits `field.type` verbatim as the SQL column type. `Field.type` is one of the app's internal abstract names (`varchar`, `int`, `bigint`, `decimal`, `float`, `boolean`, `date`, `timestamp`, `uuid`, `json`, `blob`, or a free-text custom value — see [fieldTypes.ts](../../../src/components/erd/fieldTypes.ts)), optionally with a length/precision suffix (e.g. `varchar(255)`, `decimal(10,2)`) parsed by [fieldTypeParams.ts](../../../src/components/erd/fieldTypeParams.ts). None of these are guaranteed-valid column types in Postgres or MySQL, and identifiers (table/field names) are never quoted, so a name colliding with a reserved word produces broken SQL.

### Design

`generateDdl(schema, dialect)` where `dialect: 'postgres' | 'mysql'`. A per-dialect mapping table converts each base type (post length/precision extraction) to its real column type:

| internal base type | PostgreSQL | MySQL |
|---|---|---|
| `varchar(n)` | `VARCHAR(n)` | `VARCHAR(n)` |
| `text` | `TEXT` | `TEXT` |
| `int` (non-PK) | `INTEGER` | `INT` |
| `int` (PK) | `SERIAL` | `INT AUTO_INCREMENT` |
| `bigint` (non-PK) | `BIGINT` | `BIGINT` |
| `bigint` (PK) | `BIGSERIAL` | `BIGINT AUTO_INCREMENT` |
| `decimal(p,s)` | `DECIMAL(p,s)` | `DECIMAL(p,s)` |
| `float` | `REAL` | `FLOAT` |
| `boolean` | `BOOLEAN` | `BOOLEAN` |
| `date` | `DATE` | `DATE` |
| `timestamp` | `TIMESTAMP` | `TIMESTAMP` |
| `uuid` | `UUID` | `CHAR(36)` |
| `json` | `JSONB` | `JSON` |
| `blob` | `BYTEA` | `BLOB` |
| custom/unrecognized | passed through verbatim | passed through verbatim |

Identifiers are quoted per dialect: `"name"` for Postgres, `` `name` `` for MySQL — applied to every table and column name in both `CREATE TABLE` and `ALTER TABLE` statements. This also closes the known gap (flagged in project memory) that the current exporter never escapes names.

Foreign keys stay as separate `ALTER TABLE ... ADD FOREIGN KEY (...) REFERENCES ...` statements after all `CREATE TABLE`s — valid in both remaining dialects (unlike SQLite, which isn't a target here, this doesn't need to be inline).

### UI

The topbar dropdown's "Export SQL" item becomes a submenu with two children, "PostgreSQL" and "MySQL". Selecting one calls the export server function with that dialect and downloads `schema-<sessionId>.sql`, same as today's single-item flow.

## 2. Image export

Adds `html-to-image` as a dependency (the standard approach for exporting a React Flow canvas — no built-in export utility ships with `@xyflow/react` itself).

Flow, triggered from a new "Export Image" dropdown item:

1. Read the current viewport transform via React Flow's `getViewport()`.
2. Call `fitView({ duration: 0 })` so every table is in frame regardless of the user's current zoom/pan — an instant fit, not the animated one the existing "Fit view" button uses, since this one isn't meant to be seen.
3. Wait one animation frame for the DOM to reflect the new transform.
4. Capture the `.react-flow__viewport` element with `html-to-image`'s `toPng`.
5. Restore the original viewport via `setViewport(original)` — the export must not leave the user's canvas state changed.
6. Trigger a download of the resulting PNG as `diagram-<sessionId>.png`.

Captures whichever view mode (Fields or Relations) is currently active — no separate control for this, it's just "export what's on screen, fully zoomed to fit."

## 3. Relations export

No new computation — reuses `summarizeAllTables` from [summarize.ts](../../../src/mutations/summarize.ts) exactly as the on-canvas summary dialog does.

New server function builds a Markdown string: for each table (in existing schema order), a `## TableName` heading followed by its relationship lines as a bullet list (each line already comes pre-formatted as `**A** ↔ **B** — comment (cardinality)`, which renders correctly as Markdown bold). Tables with no relationships still get a heading, with a single `_No relationships._` line underneath instead of a bullet list.

Triggered from a new "Export Relations" dropdown item; downloads `relations-<sessionId>.md`.

## 4. JSON export / import

### Export format

```jsonc
{
  "formatVersion": 1,
  "sessionName": "string",
  "tables": [
    {
      "id": 123,               // file-local id, reused from the DB row at export time
      "name": "string",
      "positionX": 0,
      "positionY": 0,
      "roleOverride": "master" | "transactional" | null,
      "fields": [
        { "id": 456, "name": "string", "type": "string", "isPrimaryKey": false, "isForeignKey": false, "order": 0 }
      ]
    }
  ],
  "relationships": [
    { "fromFieldId": 456, "toFieldId": 789, "cardinality": "one-to-many", "aiComment": "string" }
  ]
}
```

`formatVersion` exists so a future incompatible change can be detected and rejected with a clear message rather than silently misimporting — no migration logic is being built now, just the version tag itself. Field/table ids are carried through as-is from the exporting session; the importer treats them as arbitrary file-local identifiers, not real DB ids (they won't be, on the receiving end).

Export is a straightforward read via `getFullSchema` + JSON serialization; downloads `schema-<sessionId>.json`. Triggered from a new "Export JSON" dropdown item.

### Import format & flow

Import is offered in two places:
- **Dashboard** ("Import Session" button near "+ New session"): always creates a new session.
- **Session topbar dropdown** ("Import..."): opens a small dialog asking "Import as a new session" or "Replace this session's contents" before proceeding, since replacing is destructive.

Steps:

1. File picker (`accept=".json"`) reads the file as text.
2. Parse as JSON; validate against a zod schema mirroring the export shape above, including a `formatVersion === 1` check.
3. On validation failure (bad JSON, wrong shape, unknown `formatVersion`): toast an error, nothing is written, no session created/modified.
4. On success, call a new `importSchema(db, targetSessionId, data)` mutation, wrapped in a single DB transaction:
   - If replacing an existing session: delete its current tables (cascades to fields and relationships per existing FK constraints).
   - Insert each table directly (not via `addTable`, which auto-assigns a cascade position) preserving `name`, `positionX`, `positionY`, `roleOverride`, building an `oldTableId -> newTableId` map.
   - Insert each field directly per table, preserving `name`, `type`, `isPrimaryKey`, `isForeignKey`, `order`, building an `oldFieldId -> newFieldId` map.
   - Insert relationships with `fromFieldId`/`toFieldId` remapped through the field-id map; a relationship whose id doesn't resolve (corrupt file) is skipped rather than failing the whole import, since the schema is still usable without it.
5. If targeting a new session: create it named after `sessionName` from the file (falling back to a generic name if blank), then import into it.
6. Navigate to the resulting session on success.

### Explicitly deferred: SQL DDL import

Not built in this pass. Parsing arbitrary `CREATE TABLE`/`ALTER TABLE` SQL correctly across dialects (quoting styles, inline vs. out-of-line constraints, dialect-specific type syntax) needs a real SQL parser rather than hand-rolled regex, and is a large enough scope to deserve its own future brainstorming session once the JSON round-trip (and its mutation-layer plumbing) is proven out.

## Testing

- **Dialect type mapping**: one test per `FIELD_TYPES` entry per dialect, confirming correct output type and identifier quoting.
- **Relations export**: confirms Markdown output matches `summarizeAllTables`'s lines, including the no-relationships case.
- **JSON round-trip**: export a schema, import it (as a new session), assert the resulting `getFullSchema` is deep-equal to the original modulo ids.
- **Import validation**: malformed JSON and a wrong/missing `formatVersion` both reject cleanly with no partial writes.
- **Image export**: cannot be verified by automated tooling in this environment — left as a manual check (open the exported PNG) rather than an automated test.
