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
