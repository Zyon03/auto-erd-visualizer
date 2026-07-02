import { createFileRoute } from '@tanstack/react-router'
import { getSessionEmitter } from '../agent/turnEvents'

export const Route = createFileRoute('/api/sessions/$sessionId/events')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const sessionId = Number(params.sessionId)
        const emitter = getSessionEmitter(sessionId)

        let listener: (event: unknown) => void = () => {}
        const stream = new ReadableStream({
          start(controller) {
            listener = (event) => {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
            }
            emitter.on('turn-event', listener)
          },
          cancel() {
            emitter.off('turn-event', listener)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
