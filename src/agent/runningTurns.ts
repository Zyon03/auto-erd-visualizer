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
