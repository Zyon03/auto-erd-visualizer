import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { createSession, listSessions, getSession, renameSession, deleteSession, setSessionModel } from '../mutations/sessions'
import { MODEL_OPTIONS } from '../agent/models'
import { cancelRunningTurn } from '../agent/runningTurns'
import { deleteSessionEmitter } from '../agent/turnEvents'

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

export const renameSessionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    return renameSession(db, data.sessionId, data.name)
  })

export const deleteSessionFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => {
    // Cancel first so an in-flight `claude` turn doesn't keep running (and writing) against a
    // session id that's about to disappear — the process still exits asynchronously, so runTurn's
    // event handlers guard their own writes rather than assuming this fully closes the race.
    cancelRunningTurn(data.sessionId)
    deleteSession(db, data.sessionId)
    deleteSessionEmitter(data.sessionId)
  })

export const setSessionModelFn = createServerFn({ method: 'POST' })
  .validator(z.object({ sessionId: z.number(), model: z.enum(MODEL_OPTIONS).nullable() }))
  .handler(async ({ data }) => {
    return setSessionModel(db, data.sessionId, data.model)
  })
