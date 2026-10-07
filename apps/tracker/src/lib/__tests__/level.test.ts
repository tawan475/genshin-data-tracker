import { describe, expect, it } from 'vitest'
import { ASCENSION_LEVEL_CAPS, formatLevel, levelCap } from '../level'

describe('level cap', () => {
  it('follows the ascension phase', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((a) => levelCap(a))).toEqual([20, 40, 50, 60, 70, 80, 90])
    expect(ASCENSION_LEVEL_CAPS).toHaveLength(7)
  })

  it('shows the cap a level is waiting at and the one after an ascension', () => {
    expect(levelCap(5, 80)).toBe(80) // 80/80: ascend next
    expect(levelCap(6, 80)).toBe(90) // ascended, not levelled yet
    expect(levelCap(0, 1)).toBe(20)
    expect(levelCap(1, 20)).toBe(40)
  })

  it('stops 1★/2★ weapons at 70', () => {
    expect(levelCap(4, 70)).toBe(70)
  })

  it('shows 95/95 and 100/100 past 90 (raised with Masterless Stardust, not EXP)', () => {
    expect(levelCap(6, 90)).toBe(90)
    expect(levelCap(6, 95)).toBe(95)
    expect(levelCap(6, 100)).toBe(100)
    expect(formatLevel(95, 6)).toBe('Lv. 95/95')
  })

  it('never shows a cap below the level, and clamps odd ascensions', () => {
    expect(levelCap(2, 60)).toBe(60)
    expect(levelCap(3, 61)).toBe(70)
    expect(levelCap(-1, 5)).toBe(20)
    expect(levelCap(9, 90)).toBe(90)
    expect(levelCap(Number.NaN, 30)).toBe(40)
  })

  it('formats like the game', () => {
    expect(formatLevel(80, 6)).toBe('Lv. 80/90')
    expect(formatLevel(90, 6)).toBe('Lv. 90/90')
    expect(formatLevel(70, 4)).toBe('Lv. 70/70')
  })
})
