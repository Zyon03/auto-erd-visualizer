import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { db } from '../db/client'
import { listChatMessagesPage } from '../mutations/chatMessages'
import { runTurn } from '../agent/runTurn'
import { publishTurnEvent } from '../agent/turnEvents'
import { cancelRunningTurn } from '../agent/runningTurns'

const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'auto-erd.db')

// Starting guess (see docs/superpowers/plans/2026-07-03-chat-message-pagination.md) — enough to
// fill the chat panel's "expanded" (70vh) view plus scroll headroom without feeling clipped.
// Not measured against a real long session yet; revisit if it feels too small/large in practice.
const CHAT_PAGE_SIZE = 50

export const listChatMessagesFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => listChatMessagesPage(db, data.sessionId, { limit: CHAT_PAGE_SIZE }))

export const loadEarlierChatMessagesFn = createServerFn()
  .validator(z.object({ sessionId: z.number(), beforeId: z.number() }))
  .handler(async ({ data }) =>
    listChatMessagesPage(db, data.sessionId, { limit: CHAT_PAGE_SIZE, beforeId: data.beforeId }),
  )

export const sendMessageFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), content: z.string().min(1) }))
  .handler(async ({ data }) => {
    return runTurn(db, data.sessionId, data.content, DATABASE_PATH, (event) => {
      publishTurnEvent(data.sessionId, event)
    })
  })

export const cancelTurnFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => {
    cancelRunningTurn(data.sessionId)
  })
