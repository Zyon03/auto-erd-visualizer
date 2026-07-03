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
  {
    title: 'Add table',
    description:
      'Add a new table to the ERD. Set `role` to `master` or `transactional` based on what the table represents ' +
      "— a foreign key alone doesn't make a table transactional (e.g. an Employee table referencing Department " +
      "is still master data). Omitting it falls back to guessing from foreign keys, which isn't reliable.",
    inputSchema: { name: z.string().min(1), role: z.enum(['master', 'transactional']).optional() },
  },
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

server.registerTool(
  'ask_question',
  {
    title: 'Ask a clarifying question',
    description:
      'Pause and ask the user a clarifying question about an ambiguous business requirement, optionally with ' +
      'choices to pick from. Use during early/mid spec phases when a decision meaningfully shapes the schema and ' +
      "isn't obvious from context. After calling this, stop — do not call further tools this turn; wait for the " +
      "user's reply on the next turn.",
    inputSchema: {
      question: z.string().min(1),
      choices: z.array(z.string().min(1)).optional(),
      allowMultiple: z.boolean().optional(),
    },
  },
  async (input) => textResult(tools.ask_question(input).summary),
)

server.registerTool(
  'rename_session',
  {
    title: 'Rename session',
    description:
      "Rename this session to a short name (2-4 words) that captures the system being modeled — just the system " +
      'name itself, e.g. "Library System" or "E-commerce Store", no "Session" prefix and no filler like "ERD for...". ' +
      "Only ever offered on a session's first turn, and only takes effect if the session still has its default " +
      'auto-generated name — has no effect otherwise, so it is always safe to call.',
    inputSchema: { name: z.string().min(1) },
  },
  async (input) => textResult(tools.rename_session(input).summary),
)

const transport = new StdioServerTransport()
await server.connect(transport)
