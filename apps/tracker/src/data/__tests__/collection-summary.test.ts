import { describe, expect, it } from 'vitest'
import { collectionFigures } from '../collection-summary'

describe('collectionFigures', () => {
  it('has no figure for a part no capture had, and counts what needs no game data', () => {
    const none = collectionFigures({}, null, null)
    expect(Object.values(none).every((figure) => figure === null)).toBe(true)

    const figures = collectionFigures(
      {
        defeats: { value: { 1: { defeated: 3 }, 2: { defeated: 0, captured: 1 } }, takenAt: 1 },
        handbook: {
          value: {
            chapters: {
              1: { progress: 5, total: 5, state: 'claimed' },
              2: { progress: 1, total: 5, state: 'open' },
            },
            targets: {},
          },
          takenAt: 1,
        },
        spincrystals: { value: [141_001, 141_999], takenAt: 1 },
      },
      null,
      [
        { id: 141_001, key: 'RadiantSpincrystal1', number: 1 },
        { id: 141_002, key: 'RadiantSpincrystal2', number: 2 },
      ],
    )
    expect(figures['living-beings']).toEqual({ count: 1 })
    expect(figures.handbook).toEqual({ have: 1, total: 2 })
    expect(figures.spincrystals).toEqual({ have: 1, total: 2 })
    // These wait for the game data's lists.
    expect(figures.archive).toBeNull()
  })
})
