import materialsJson from '@gdt/game-data/data/materials.json'
import { describe, expect, it } from 'vitest'
import {
  filterSpincrystals,
  spincrystalGuide,
  spincrystalProgress,
  spincrystalsOf,
  type Spincrystal,
} from '../spincrystals'

const all = spincrystalsOf(materialsJson.materials)

describe('spincrystalsOf', () => {
  it("finds the game data's Radiant Spincrystals by their icon, and nothing else", () => {
    // 7.1: 206, ids 141001-141306 (the range also holds foods, which are not).
    expect(all.length).toBeGreaterThanOrEqual(206)
    expect(all[0]).toEqual({ id: 141_001, key: 'RadiantSpincrystal1', number: 1 })
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
    expect(all.every((s) => s.key.startsWith('RadiantSpincrystal'))).toBe(true)
    expect(all.some((s) => s.key === 'FragrantSteak')).toBe(false)
    const named = all.filter((s) => s.number === null)
    expect(named.map((s) => s.key)).toContain('RadiantSpincrystalTheLongWayHomePartI')
    expect(all.find((s) => s.key === 'RadiantSpincrystal100')?.number).toBe(100)
  })
})

describe('spincrystalProgress', () => {
  const sample: Spincrystal[] = [
    { id: 141_001, key: 'RadiantSpincrystal1', number: 1 },
    { id: 141_200, key: 'RadiantSpincrystal100', number: 100 },
    { id: 141_002, key: 'RadiantSpincrystal2', number: 2 },
    { id: 141_257, key: 'RadiantSpincrystalTheLongWayHomePartI', number: null },
  ]

  it('marks what the capture has, numbered ones by number, and counts unknown ids apart', () => {
    const p = spincrystalProgress(sample, [141_002, 141_257, 141_999])
    expect(p.numbered.map((r) => [r.number, r.have])).toEqual([
      [1, false],
      [2, true],
      [100, false],
    ])
    expect(p.named.map((r) => [r.key, r.have])).toEqual([
      ['RadiantSpincrystalTheLongWayHomePartI', true],
    ])
    expect([p.have, p.total, p.unknown]).toEqual([2, 4, [141_999]])
  })

  it('filters All / Missing / Have', () => {
    const { numbered } = spincrystalProgress(sample, [141_002])
    expect(filterSpincrystals(numbered, 'all')).toHaveLength(3)
    expect(filterSpincrystals(numbered, 'have').map((r) => r.number)).toEqual([2])
    expect(filterSpincrystals(numbered, 'missing').map((r) => r.number)).toEqual([1, 100])
  })

  it('takes a real-scale capture: 120 of the 206', () => {
    const owned = all.filter((_, i) => i % 7 < 4).map((s) => s.id)
    const p = spincrystalProgress(all, owned)
    expect(p.have).toBe(owned.length)
    expect(p.numbered.length + p.named.length).toBe(all.length)
    expect(p.unknown).toEqual([])
  })
})

describe('spincrystalGuide', () => {
  it('links the numbered ones to their wiki page and searches the song-named ones', () => {
    expect(spincrystalGuide({ number: 55 }, 'Radiant Spincrystal 55')).toBe(
      'https://genshin-impact.fandom.com/wiki/Radiant_Spincrystal_55',
    )
    expect(
      spincrystalGuide({ number: null }, 'Radiant Spincrystal "The Long Way Home: Part I"'),
    ).toBe(
      'https://genshin-impact.fandom.com/wiki/Special:Search?query=Radiant%20Spincrystal%20%22The%20Long%20Way%20Home%3A%20Part%20I%22',
    )
  })
})
