import { describe, expect, it } from 'vitest'
import type { CharacterView } from '@/data/characters'
import {
  ROSTER_FRAME_WIDTH,
  ROSTER_MAX_COLUMNS,
  ROSTER_MIN_COLUMNS,
  rosterColumns,
  rosterSummary,
  rosterWidth,
} from '../roster-card'

const char = (over: Partial<CharacterView>): CharacterView =>
  ({
    key: 'X',
    name: 'X',
    rarity: 4,
    element: 'pyro',
    level: 1,
    constellation: 0,
    ...over,
  }) as CharacterView

describe('rosterColumns', () => {
  it('stays between the minimum and the maximum', () => {
    expect(rosterColumns(0)).toBe(ROSTER_MIN_COLUMNS)
    expect(rosterColumns(5)).toBe(ROSTER_MIN_COLUMNS)
    expect(rosterColumns(500)).toBe(ROSTER_MAX_COLUMNS)
  })

  it('grows with the roster', () => {
    expect(rosterColumns(50)).toBe(10)
    expect(rosterColumns(75)).toBe(12)
  })

  it('fits the widest card in the export frame', () => {
    expect(rosterWidth(ROSTER_MAX_COLUMNS)).toBeLessThanOrEqual(ROSTER_FRAME_WIDTH)
  })
})

describe('rosterSummary', () => {
  it('counts elements in the game order, rarities highest first, C6 and level 90+', () => {
    const summary = rosterSummary([
      char({ element: 'hydro', rarity: 5, constellation: 6, level: 90 }),
      char({ element: 'pyro', rarity: 4, level: 80 }),
      char({ element: 'pyro', rarity: 4, constellation: 6, level: 90 }),
      char({ element: null, rarity: null }),
    ])
    expect(summary.elements).toEqual([
      { element: 'pyro', count: 2 },
      { element: 'hydro', count: 1 },
    ])
    expect(summary.rarities).toEqual([
      { rarity: 5, count: 1 },
      { rarity: 4, count: 2 },
    ])
    expect(summary.c6).toBe(2)
    expect(summary.level90).toBe(2)
  })
})
