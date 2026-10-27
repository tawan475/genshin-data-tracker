import { describe, expect, it } from 'vitest'
import type { PlannerData } from '@gdt/game-data'
import { withoutGems, type RequirementCache } from '../model'

describe('withoutGems', () => {
  const planner = {
    materialsByKey: new Map([
      ['VayudaTurquoiseSliver', { kind: 'gem' }],
      ['HurricaneSeed', { kind: 'boss' }],
    ]),
  } as unknown as PlannerData
  const requirement = {
    items: new Map([
      ['VayudaTurquoiseSliver', 1],
      ['HurricaneSeed', 3],
    ]),
    mora: 20_000,
    characterExp: 0,
    weaponExp: 0,
  }
  const cache = {
    character: () => requirement,
    weapon: () => null,
  } as unknown as RequirementCache

  it('leaves gemstones out and keeps one object per requirement', () => {
    const gemless = withoutGems(cache, planner)
    const a = gemless.character('Venti', {} as never, {} as never)!
    expect([...a.items]).toEqual([['HurricaneSeed', 3]])
    expect(a.mora).toBe(20_000)
    expect(gemless.character('Venti', {} as never, {} as never)).toBe(a)
    expect(gemless.weapon('Dull', {} as never, {} as never)).toBeNull()
  })
})
