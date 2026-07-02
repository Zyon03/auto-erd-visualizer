const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** SQLite's `current_timestamp` default is UTC without a zone suffix, e.g. "2026-07-02 10:00:00". */
export function relativeTime(sqliteTimestamp: string): string {
  const date = new Date(sqliteTimestamp.replace(' ', 'T') + 'Z')
  const seconds = (date.getTime() - Date.now()) / 1000

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(seconds) >= secondsInUnit) {
      return rtf.format(Math.round(seconds / secondsInUnit), unit)
    }
  }
  return rtf.format(Math.round(seconds), 'second')
}
