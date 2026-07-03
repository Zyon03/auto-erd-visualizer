import { eq, asc, desc, and, lt } from 'drizzle-orm'
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

export interface ChatMessagePage {
  messages: ChatMessage[]
  /** True if there are still-older messages beyond this page — lets the UI show/hide a "load
   *  earlier" affordance without an extra round-trip to find out. */
  hasMore: boolean
}

export function addChatMessage(db: Db, sessionId: number, role: ChatRole, content: string): ChatMessage {
  const [row] = db.insert(chatMessages).values({ sessionId, role, content }).returning().all()
  return row as ChatMessage
}

/** The complete, unpaginated history — kept as-is (no limit) specifically because
 *  agent/runTurn.ts relies on this for turn context (resolveTurnMessage walks it to find the
 *  last user/assistant message and any pending system notes after it). That only ever needs the
 *  tail in practice, but changing what this returns is a bigger, separate decision from paginating
 *  what the *UI* loads — see listChatMessagesPage for that. */
export function listChatMessages(db: Db, sessionId: number): ChatMessage[] {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id))
    .all() as ChatMessage[]
}

/** A page of the most recent messages (or, with `beforeId`, the page immediately older than that
 *  message), for the chat panel's display — a long-running session's chat_messages can run into
 *  the hundreds (every AI tool call writes one), and the panel only ever shows a handful at a
 *  time, so there's no reason to fetch/mount all of them up front. Always returns oldest-first,
 *  matching listChatMessages' order, regardless of how it's queried internally. */
export function listChatMessagesPage(
  db: Db,
  sessionId: number,
  options: { limit: number; beforeId?: number },
): ChatMessagePage {
  const condition = options.beforeId
    ? and(eq(chatMessages.sessionId, sessionId), lt(chatMessages.id, options.beforeId))
    : eq(chatMessages.sessionId, sessionId)

  // Fetch one extra row so "was there more?" is answered by this same query instead of a
  // separate count — if we get limit+1 back, there's at least one more page beyond this one.
  const rows = db
    .select()
    .from(chatMessages)
    .where(condition)
    .orderBy(desc(chatMessages.id))
    .limit(options.limit + 1)
    .all() as ChatMessage[]

  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows
  page.reverse()
  return { messages: page, hasMore }
}
