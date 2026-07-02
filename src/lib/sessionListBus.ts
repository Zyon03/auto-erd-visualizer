/** Lets the ERD canvas/chat tell the sidebar "a session's tables may have changed" — the
 *  sidebar's own session list is otherwise only refreshed by its own create/rename/delete
 *  actions, so table counts would go stale the moment a table is added inside a session. */
const bus = new EventTarget()
const CHANGED_EVENT = 'sessions-changed'

export function notifySessionsChanged(): void {
  bus.dispatchEvent(new Event(CHANGED_EVENT))
}

export function onSessionsChanged(handler: () => void): () => void {
  bus.addEventListener(CHANGED_EVENT, handler)
  return () => bus.removeEventListener(CHANGED_EVENT, handler)
}
