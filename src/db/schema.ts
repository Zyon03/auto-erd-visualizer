import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  claudeSessionId: text('claude_session_id'),
  model: text('model'),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
})

export const tables = sqliteTable('tables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  positionX: real('position_x').notNull().default(0),
  positionY: real('position_y').notNull().default(0),
  autoPositioned: integer('auto_positioned', { mode: 'boolean' }).notNull().default(true),
})

export const fields = sqliteTable('fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableId: integer('table_id')
    .notNull()
    .references(() => tables.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),
  isPrimaryKey: integer('is_primary_key', { mode: 'boolean' }).notNull().default(false),
  isForeignKey: integer('is_foreign_key', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull().default(0),
})

export const relationships = sqliteTable('relationships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  fromFieldId: integer('from_field_id')
    .notNull()
    .references(() => fields.id, { onDelete: 'cascade' }),
  toFieldId: integer('to_field_id')
    .notNull()
    .references(() => fields.id, { onDelete: 'cascade' }),
  cardinality: text('cardinality', {
    enum: ['one-to-one', 'one-to-many', 'many-to-many'],
  }).notNull(),
  aiComment: text('ai_comment').notNull().default(''),
})

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
})
