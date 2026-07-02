export interface TablePosition {
  id: number
  positionX: number
  positionY: number
}

const COLUMN_WIDTH = 320
const ROW_HEIGHT = 280
const COLUMNS_PER_ROW = 4

const RELATED_OFFSET_X = 340
const RELATED_OFFSET_Y = 60

/** Fixed-size grid placement — table cards' real rendered size isn't known at insert time,
 *  so this uses generous fixed spacing rather than measuring anything. */
export function nextCascadePosition(existing: TablePosition[]): { positionX: number; positionY: number } {
  const index = existing.length
  const col = index % COLUMNS_PER_ROW
  const row = Math.floor(index / COLUMNS_PER_ROW)
  return { positionX: col * COLUMN_WIDTH, positionY: row * ROW_HEIGHT }
}

function collides(candidate: { positionX: number; positionY: number }, others: TablePosition[]): boolean {
  return others.some(
    (t) =>
      Math.abs(t.positionX - candidate.positionX) < COLUMN_WIDTH * 0.6 &&
      Math.abs(t.positionY - candidate.positionY) < ROW_HEIGHT * 0.6,
  )
}

/** Places a table near `reference`, trying a few candidate offsets before falling back to the
 *  cascade grid if every candidate collides with an existing table. */
export function positionNear(
  reference: TablePosition,
  existing: TablePosition[],
  excludeId: number,
): { positionX: number; positionY: number } {
  const others = existing.filter((t) => t.id !== excludeId)
  const candidates = [
    { dx: RELATED_OFFSET_X, dy: 0 },
    { dx: RELATED_OFFSET_X, dy: RELATED_OFFSET_Y },
    { dx: RELATED_OFFSET_X, dy: -RELATED_OFFSET_Y },
    { dx: 0, dy: ROW_HEIGHT },
    { dx: -RELATED_OFFSET_X, dy: 0 },
  ]

  for (const { dx, dy } of candidates) {
    const candidate = { positionX: reference.positionX + dx, positionY: reference.positionY + dy }
    if (!collides(candidate, others)) return candidate
  }

  return nextCascadePosition(others)
}
