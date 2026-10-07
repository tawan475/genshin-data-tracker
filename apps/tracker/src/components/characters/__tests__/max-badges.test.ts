import { describe, expect, it } from 'vitest'
import { MAX_REFINEMENT } from '@/data/weapons'
import {
  CONSTELLATION_MAX_STYLE,
  isMaxConstellation,
  isMaxRefinement,
  refinementStyle,
} from '../max-badges'

describe('constellation badge', () => {
  it('is maxed at C6 only', () => {
    expect([0, 1, 5, 6].map(isMaxConstellation)).toEqual([false, false, false, true])
  })

  it("is the game's gold chip when maxed", () => {
    expect(CONSTELLATION_MAX_STYLE).toEqual({
      background: 'linear-gradient(180deg, #fcde54 0%, #f0cc4e 100%)',
      color: '#8a4e24',
      boxShadow: '0 1px 4px rgba(80,50,0,0.45)',
    })
  })
})

describe('refinement badge', () => {
  it('is maxed at R5 by default', () => {
    expect(MAX_REFINEMENT).toBe(5)
    expect([1, 4, 5].map((r) => isMaxRefinement(r))).toEqual([false, false, true])
  })

  it("follows a weapon's own maximum when given", () => {
    expect(isMaxRefinement(1, 1)).toBe(true)
    expect(isMaxRefinement(3, 4)).toBe(false)
  })

  it("takes the game's colours, maxed or not", () => {
    expect(refinementStyle(5)).toEqual({ background: '#a86858', color: '#f8e048' })
    for (const r of [1, 2, 3, 4]) {
      expect(refinementStyle(r)).toEqual({ background: '#303048', color: '#c8c8c8' })
    }
  })
})
