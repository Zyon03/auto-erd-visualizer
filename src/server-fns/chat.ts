import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { db } from '../db/client'
import { listChatMessages } from '../mutations/chatMessages'
import { runTurn } from '../agent/runTurn'
import { publishTurnEvent } from '../agent/turnEvents'
import { cancelRunningTurn } from '../agent/runningTurns'

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

export const cancelTurnFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => {
    cancelRunningTurn(data.sessionId)
  })
