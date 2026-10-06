import { describe, expect, it } from 'vitest'
import plannerJson from '@gdt/game-data/data/planner.json'
import { decodePlanner } from '@gdt/game-data'
import type { PlannerFile } from '@gdt/game-data/format'
import type { CharacterState } from '@gdt/game-data/planner-math'
import { isSeelieExport, mapSeelieGoals, seelieKeys } from '../seelie'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const keys = seelieKeys(planner)

/** Made-up goals in Seelie's export shape (not anyone's real data). */
const fixture = {
  goals: [
    {
      type: 'character',
      character: 'hutao',
      cons: 1,
      current: { level: 80, asc: 5 },
      goal: { level: 90, asc: 6 },
      id: 1,
    },
    {
      type: 'talent',
      character: 'hutao',
      normal: { current: 6, goal: 10 },
      skill: { current: 8, goal: 9 },
      burst: { current: 8, goal: 9 },
      id: 2,
    },
    {
      type: 'weapon',
      character: 'hutao',
      weapon: 'staff_of_homa',
      current: { level: 1, asc: 0, craft: 0 },
      goal: { level: 80, asc: 6, craft: 0 },
      id: 3,
    },
    { type: 'talent', character: 'shogun', normal: { current: 1, goal: 9 }, id: 4 },
    {
      type: 'weapon',
      character: 'shogun',
      weapon: 'grasscutters_light',
      goal: { level: 90, asc: 6 },
      id: 5,
    },
    { type: 'character', character: 'traveler_cryo', goal: { level: 100, asc: 6 }, id: 6 },
    { type: 'weapon', character: 'bennett', weapon: 'freedom-sworn', goal: { level: 70 }, id: 7 },
    {
      type: 'weapon',
      character: 'kaeya',
      weapon: 'silver_sword',
      goal: { level: 90, asc: 6 },
      id: 8,
    },
    { type: 'character', character: 'not_a_character', goal: { level: 90, asc: 6 }, id: 9 },
    { type: 'weapon', character: 'kaeya', weapon: 'not_a_weapon', goal: { level: 90 }, id: 10 },
    { type: 'task', id: 11 },
    'junk',
  ],
  inactive: { '1': true },
  server: 'asia',
}

const roster: Record<string, CharacterState> = {
  HuTao: { level: 80, ascension: 5, talents: { auto: 6, skill: 8, burst: 8 } },
  RaidenShogun: { level: 90, ascension: 6, talents: { auto: 1, skill: 9, burst: 10 } },
}
const context = {
  character: (key: string): CharacterState =>
    roster[key] ?? { level: 1, ascension: 0, talents: { auto: 1, skill: 1, burst: 1 } },
  refinement: (key: string) => (key === 'StaffOfHoma' ? 2 : 1),
}

describe('Seelie slugs', () => {
  it('maps names by their letters, aliases and unique endings', () => {
    expect(keys.character('hutao')).toBe('HuTao')
    expect(keys.character('hu_tao')).toBe('HuTao')
    expect(keys.character('yun_jin')).toBe('YunJin')
    expect(keys.character('shogun')).toBe('RaidenShogun')
    expect(keys.character('kazuha')).toBe('KaedeharaKazuha')
    expect(keys.character('kokomi')).toBe('SangonomiyaKokomi')
    expect(keys.character('traveler_geo')).toBe('TravelerGeo')
    expect(keys.character('manekina')).toBe('Manekina')
    expect(keys.character('traveler')).toBeNull()
    expect(keys.weapon('freedom-sworn')).toBe('FreedomSworn')
    expect(keys.weapon('a_thousand_floating_dreams')).toBe('AThousandFloatingDreams')
    expect(keys.weapon('grasscutters_light')).toBe('EngulfingLightning')
    expect(keys.weapon('mistsplitters_reflection')).toBe('MistsplitterReforged')
    expect(keys.weapon('nope')).toBeNull()
  })
})

describe('Seelie goals', () => {
  const result = mapSeelieGoals(fixture, planner, context)
  const character = (key: string) => result.characters.find((c) => c.key === key)?.target

  it('counts what it read and reports what it could not map', () => {
    expect(result.read).toEqual({ character: 3, talent: 2, weapon: 5, other: 2 })
    expect(result.unmapped).toEqual({ characters: ['not_a_character'], weapons: ['not_a_weapon'] })
    expect(result.characters.map((c) => c.key).sort()).toEqual([
      'HuTao',
      'RaidenShogun',
      'TravelerCryo',
    ])
  })

  it('merges level and talent goals into one character goal', () => {
    expect(character('HuTao')).toEqual({
      level: 90,
      ascension: 6,
      talents: { auto: 10, skill: 9, burst: 9 },
      active: false,
    })
  })

  it('keeps the current state where Seelie has no goal', () => {
    // Raiden: only a talent goal for the normal attack.
    expect(character('RaidenShogun')).toEqual({
      level: 90,
      ascension: 6,
      talents: { auto: 9, skill: 9, burst: 10 },
      active: true,
    })
  })

  it('lowers levels above 90 to what the tracker plans', () => {
    expect(character('TravelerCryo')).toMatchObject({ level: 90, ascension: 6 })
    expect(result.clamped).toBe(2)
  })

  it('maps weapon goals with their owner and keeps the current refinement', () => {
    const weapon = (key: string) => result.weapons.find((w) => w.key === key)
    expect(weapon('StaffOfHoma')).toEqual({
      key: 'StaffOfHoma',
      owner: 'HuTao',
      target: { level: 80, ascension: 6, refinement: 2, active: true },
    })
    expect(weapon('EngulfingLightning')?.owner).toBe('RaidenShogun')
    // Level 70 needs phase 4 (ascension omitted in the file).
    expect(weapon('FreedomSworn')?.target).toMatchObject({ level: 70, ascension: 4 })
    // 1-2★ weapons stop at 70.
    expect(weapon('SilverSword')?.target).toMatchObject({ level: 70, ascension: 4 })
  })

  it('rejects files that are not Seelie exports', () => {
    expect(isSeelieExport(fixture)).toBe(true)
    expect(isSeelieExport({ gi_achievements: [] })).toBe(false)
    expect(() => mapSeelieGoals([], planner, context)).toThrow(/Seelie/)
  })
})
