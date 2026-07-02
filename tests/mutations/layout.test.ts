import { describe, it, expect } from 'vitest'
import { nextCascadePosition, positionNear, type TablePosition } from '../../src/mutations/layout'

describe('layout', () => {
  describe('nextCascadePosition', () => {
    it('places the first table at the origin', () => {
      expect(nextCascadePosition([])).toEqual({ positionX: 0, positionY: 0 })
    })

    it('never repeats a position across successive calls', () => {
      const positions: TablePosition[] = []
      for (let i = 0; i < 12; i++) {
        const pos = nextCascadePosition(positions)
        positions.push({ id: i, ...pos })
      }
      const seen = new Set(positions.map((p) => `${p.positionX},${p.positionY}`))
      expect(seen.size).toBe(positions.length)
    })

    it('wraps to a new row after filling a row of columns', () => {
      const positions: TablePosition[] = Array.from({ length: 4 }, (_, i) => ({
        id: i,
        positionX: i * 320,
        positionY: 0,
      }))
      const next = nextCascadePosition(positions)
      expect(next.positionX).toBe(0)
      expect(next.positionY).toBeGreaterThan(0)
    })
  })

  describe('positionNear', () => {
    it('places a table close to the reference when nothing else is around', () => {
      const reference: TablePosition = { id: 1, positionX: 0, positionY: 0 }
      const result = positionNear(reference, [reference], 2)
      const distance = Math.hypot(result.positionX - reference.positionX, result.positionY - reference.positionY)
      expect(distance).toBeLessThan(400)
    })

    it('does not collide with an existing table occupying the nearest candidate slot', () => {
      const reference: TablePosition = { id: 1, positionX: 0, positionY: 0 }
      const occupant: TablePosition = { id: 2, positionX: 340, positionY: 0 }
      const moving: TablePosition = { id: 3, positionX: 999, positionY: 999 }
      const result = positionNear(reference, [reference, occupant, moving], moving.id)
      const overlapsOccupant =
        Math.abs(result.positionX - occupant.positionX) < 192 && Math.abs(result.positionY - occupant.positionY) < 168
      expect(overlapsOccupant).toBe(false)
    })
  })
})
