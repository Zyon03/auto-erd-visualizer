import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db/client'
import { generateDdl } from '../export/ddl'

export const exportDdlFn = createServerFn()
  .validator(z.object({ sessionId: z.number() }))
  .handler(async ({ data }) => generateDdl(db, data.sessionId))
