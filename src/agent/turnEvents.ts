import { EventEmitter } from 'node:events'

const emitters = new Map<number, EventEmitter>()

export function getSessionEmitter(sessionId: number): EventEmitter {
  let emitter = emitters.get(sessionId)
  if (!emitter) {
    emitter = new EventEmitter()
    emitters.set(sessionId, emitter)
  }
  return emitter
}

export function publishTurnEvent(sessionId: number, event: unknown): void {
  getSessionEmitter(sessionId).emit('turn-event', event)
}

// getSessionEmitter lazily creates an entry per sessionId and nothing ever removed it — since
// session ids are never reused, every session that was ever opened left its emitter in this Map
// for the lifetime of the server process. Call this when a session is deleted so the Map doesn't
// grow without bound.
export function deleteSessionEmitter(sessionId: number): void {
  const emitter = emitters.get(sessionId)
  if (!emitter) return
  emitter.removeAllListeners()
  emitters.delete(sessionId)
}
