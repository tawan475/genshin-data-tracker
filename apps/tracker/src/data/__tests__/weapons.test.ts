import type { Good, GoodWeapon } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  NO_WEAPON_FILTERS,
  buildArmory,
  filterWeapons,
  groupWeapons,
  levelMatches,
  raritySections,
  sanitizeWeaponFilters,
  sanitizeWeaponPrefs,
  sortGroups,
  sortWeapons,
  weaponFacetCounts,
  weaponTitle,
} from '@/data/weapons'

const IDS: Record<string, number> = {
  AquaSimulacra: 15508,
  PolarStar: 15507,
  StaffOfHoma: 13501,
  Rainslasher: 12405,
  FavoniusGreatsword: 12401,
  DebateClub: 12302,
  OldMercsPal: 12201,
  WasterGreatsword: 12101,
}
const gameId = (key: string) => IDS[key] ?? 0

function weapon(key: string, rest: Partial<GoodWeapon> = {}): GoodWeapon {
  return { key, level: 1, ascension: 0, refinement: 1, location: '', lock: false, ...rest }
}

function good(weapons: GoodWeapon[]): Good {
  return {
    format: 'GOOD',
    version: 3,
    source: 'test',
    characters: [],
    artifacts: [],
    weapons,
    materials: {},
  }
}

const times = (n: number, w: GoodWeapon) => Array.from({ length: n }, () => ({ ...w }))

/** The case that read "Rainslasher R5 ×52": one equipped R5 and 51 spare R1s. */
const rainslashers = [
  weapon('Rainslasher', { level: 80, ascension: 5, refinement: 5, location: 'Aloy', lock: true }),
  ...times(51, weapon('Rainslasher')),
]

describe('buildArmory', () => {
  it('stacks identical spare copies and keeps equipped copies apart', () => {
    const armory = buildArmory(
      good([
        ...rainslashers,
        weapon('Rainslasher', { level: 90, ascension: 6, refinement: 1, location: 'Beidou' }),
        weapon('Rainslasher', { lock: true }),
      ]),
      gameId,
    )
    expect(armory.total).toBe(54)
    expect(armory.kinds).toBe(1)
    expect(armory.equipped).toBe(2)
    // Two equipped rows, the 51 unlocked R1s, the locked R1 on its own.
    expect(armory.rows.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 1, 1, 51])
    expect(armory.rows.every((r) => r.gameId === 12405 && r.maxLevel === 90)).toBe(true)
  })

  it('caps 1–2★ weapons at 70, so "Max" is their own cap', () => {
    const armory = buildArmory(
      good([
        weapon('WasterGreatsword', { level: 70, ascension: 4 }),
        weapon('DebateClub', { level: 70, ascension: 4 }),
        weapon('DebateClub', { level: 90, ascension: 6 }),
      ]),
      gameId,
    )
    const max = filterWeapons(armory.rows, { ...NO_WEAPON_FILTERS, level: 'max' }, armory.refine)
    expect(max.map((r) => `${r.key}:${r.level}`).sort()).toEqual([
      'DebateClub:90',
      'WasterGreatsword:70',
    ])
    expect(levelMatches({ level: 1, maxLevel: 70 }, 'base')).toBe(true)
    expect(levelMatches({ level: 20, maxLevel: 90 }, 'levelled')).toBe(true)
  })

  it('plans refinements from spare copies; 1–2★ do not refine', () => {
    const armory = buildArmory(
      good([
        weapon('FavoniusGreatsword', {
          level: 90,
          ascension: 6,
          refinement: 2,
          location: 'Bennett',
        }),
        ...times(2, weapon('FavoniusGreatsword')),
        weapon('OldMercsPal', { level: 70, ascension: 4, location: 'Noelle' }),
        ...times(4, weapon('OldMercsPal')),
      ]),
      gameId,
    )
    expect(armory.refine.get('FavoniusGreatsword')).toEqual({
      spare: 2,
      targets: [{ owner: 'Bennett', ownerName: 'Bennett', from: 2, to: 4 }],
    })
    expect(armory.refine.has('OldMercsPal')).toBe(false)
  })
})

describe('groupWeapons', () => {
  it('lists the equipped copy first, the stack after it, and counts every copy', () => {
    const armory = buildArmory(good(rainslashers), gameId)
    const [group] = groupWeapons(armory.rows, armory.refine)
    expect(group!.count).toBe(52)
    expect(group!.best.refinement).toBe(5)
    expect(group!.rows.map((r) => [r.count, r.refinement, r.level, r.location])).toEqual([
      [1, 5, 80, 'Aloy'],
      [51, 1, 1, ''],
    ])
    expect(group!.owners).toEqual([{ key: 'Aloy', name: 'Aloy' }])
  })

  it('orders spare stacks by level, then refinement', () => {
    const armory = buildArmory(
      good([
        weapon('Rainslasher', { level: 20, ascension: 1, refinement: 1 }),
        weapon('Rainslasher', { level: 40, ascension: 1, refinement: 1 }),
        weapon('Rainslasher', { level: 40, ascension: 1, refinement: 3 }),
        weapon('Rainslasher', { level: 1, refinement: 2, location: 'Xinyan' }),
      ]),
      gameId,
    )
    const [group] = groupWeapons(armory.rows, armory.refine)
    expect(group!.rows.map((r) => `${r.location || '-'} ${r.level} R${r.refinement}`)).toEqual([
      'Xinyan 1 R2',
      '- 40 R3',
      '- 40 R1',
      '- 20 R1',
    ])
    // The best copy is the highest level, whoever holds it.
    expect(group!.best.level).toBe(40)
    expect(group!.best.refinement).toBe(3)
  })
})

describe('sorting', () => {
  const armory = buildArmory(
    good([
      weapon('PolarStar', { level: 90, ascension: 6 }),
      weapon('AquaSimulacra', { level: 90, ascension: 6 }),
      weapon('StaffOfHoma', { level: 90, ascension: 6, refinement: 2 }),
      weapon('StaffOfHoma', { level: 80, ascension: 5, refinement: 5 }),
      weapon('Rainslasher', { level: 90, ascension: 6, refinement: 5 }),
      weapon('WasterGreatsword', { level: 70, ascension: 4 }),
    ]),
    gameId,
  )

  it('Quality: rarity, then level, then refinement, then the newest weapon', () => {
    const sorted = sortWeapons(armory.rows, 'quality', 'desc')
    expect(sorted.map((r) => `${r.key} ${r.level} R${r.refinement}`)).toEqual([
      'StaffOfHoma 90 R2',
      'AquaSimulacra 90 R1',
      'PolarStar 90 R1',
      'StaffOfHoma 80 R5',
      'Rainslasher 90 R5',
      'WasterGreatsword 70 R1',
    ])
    expect(sortWeapons(armory.rows, 'quality', 'asc')[0]!.key).toBe('WasterGreatsword')
  })

  it('Name and Type, ties by quality', () => {
    expect(sortWeapons(armory.rows, 'name', 'asc').map((r) => r.key)[0]).toBe('AquaSimulacra')
    const byType = sortWeapons(armory.rows, 'type', 'asc').map((r) => r.type)
    expect(byType).toEqual(['claymore', 'claymore', 'polearm', 'polearm', 'bow', 'bow'])
  })

  it('groups sort by their best copy', () => {
    const groups = sortGroups(groupWeapons(armory.rows, armory.refine), 'quality', 'desc')
    expect(groups.map((g) => g.key)).toEqual([
      'StaffOfHoma',
      'AquaSimulacra',
      'PolarStar',
      'Rainslasher',
      'WasterGreatsword',
    ])
  })

  it('splits sorted rows into rarity sections, keeping their order', () => {
    const sections = raritySections(sortWeapons(armory.rows, 'level', 'desc'))
    expect(sections.map((s) => [s.rarity, s.copies])).toEqual([
      [5, 4],
      [4, 1],
      [1, 1],
    ])
    expect(sections[0]!.rows.map((r) => r.level)).toEqual([90, 90, 90, 80])
    expect(raritySections(armory.rows, true).map((s) => s.rarity)).toEqual([1, 4, 5])
  })
})

describe('facets and titles', () => {
  it('counts copies per rarity with the other filters applied', () => {
    const armory = buildArmory(
      good([...rainslashers, weapon('StaffOfHoma', { level: 90, ascension: 6 })]),
      gameId,
    )
    const counts = weaponFacetCounts(
      armory.rows,
      { ...NO_WEAPON_FILTERS, rarity: 5, type: 'claymore' },
      armory.refine,
      'rarity',
      (r) => r.rarity,
    )
    expect([...counts]).toEqual([[4, 52]])
  })

  it('says what a tile is', () => {
    const armory = buildArmory(good(times(55, weapon('FavoniusGreatsword', { lock: true }))))
    expect(weaponTitle(armory.rows[0]!)).toBe(
      'Favonius Greatsword · R1 · Lv 1/20 · 55 copies · Locked',
    )
  })
})

describe('stored state', () => {
  it('reads old saves: rarity is Quality, grid is the Bag', () => {
    expect(sanitizeWeaponPrefs({ sort: 'rarity', direction: 'asc', view: 'grid' })).toEqual({
      sort: 'quality',
      direction: 'asc',
      view: 'bag',
    })
    expect(sanitizeWeaponPrefs(null)).toEqual({ sort: 'quality', direction: 'desc', view: 'bag' })
    expect(sanitizeWeaponPrefs({ view: 'list', sort: 'name' }).view).toBe('list')
  })

  it('drops invalid filter values, including the old "1–2★" bucket', () => {
    expect(sanitizeWeaponFilters({ rarity: 'low', level: 'max', type: 'bow', lock: 'x' })).toEqual({
      ...NO_WEAPON_FILTERS,
      level: 'max',
      type: 'bow',
    })
    expect(sanitizeWeaponFilters({ rarity: 2 }).rarity).toBe(2)
  })
})
