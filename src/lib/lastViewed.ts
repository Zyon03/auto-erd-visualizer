const STORAGE_PREFIX = 'autoerd:last-viewed:'

/** SQLite's `current_timestamp` default is UTC without a zone suffix, matching the format
 *  `createdAt` columns already use elsewhere (see relativeTime.ts) — kept in the same shape
 *  here so string comparison between the two stays valid. */
function nowAsSqliteTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

/** The threshold to compare a table's `createdAt` against for "is this new" — the last time
 *  this browser visited this session, or "now" if it's never been visited before (so an old
 *  session opened for the first time on a new browser doesn't flag everything as new). */
export function getLastViewedThreshold(sessionId: number): string {
  return localStorage.getItem(STORAGE_PREFIX + sessionId) ?? nowAsSqliteTimestamp()
}

export function markSessionViewed(sessionId: number): void {
  localStorage.setItem(STORAGE_PREFIX + sessionId, nowAsSqliteTimestamp())
}
