interface RunningTurn {
  cancel: () => void
}

const runningTurns = new Map<number, RunningTurn>()

export function registerRunningTurn(sessionId: number, entry: RunningTurn): void {
  runningTurns.set(sessionId, entry)
}

export function clearRunningTurn(sessionId: number): void {
  runningTurns.delete(sessionId)
}

/** Returns true if a turn was actually running (and therefore cancelled). */
export function cancelRunningTurn(sessionId: number): boolean {
  const entry = runningTurns.get(sessionId)
  if (!entry) return false
  entry.cancel()
  return true
}

// Lets a client reconcile its local turnInFlight state against reality -- e.g. right after its
// SSE connection (re)opens, when it may have missed the turn_complete/turn_error event that
// would normally have cleared that state (see useSessionEvents' onOpen).
export function isTurnRunning(sessionId: number): boolean {
  return runningTurns.has(sessionId)
}
