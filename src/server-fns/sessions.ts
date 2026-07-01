import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { createSession, listSessions, getSession } from '../mutations/sessions'

export const listSessionsFn = createServerFn().handler(async () => {
  return listSessions(db)
})

export const createSessionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    return createSession(db, data.name)
  })

export const getSessionFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => {
    return getSession(db, data.sessionId)
  })
