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
