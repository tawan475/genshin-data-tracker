import { describe, expect, it } from 'vitest'
import plannerJson from '@gdt/game-data/data/planner.json'
import { decodePlanner } from '@gdt/game-data'
import type { PlannerFile } from '@gdt/game-data/format'
import type { CharacterState } from '@gdt/game-data/planner-math'
import images from '@gdt/game-data/data/images.json'
import { customKeyFromSeelie, isSeelieExport, mapSeelieGoals, seelieKeys } from '../seelie'

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
    expect(result.read).toEqual({ character: 3, talent: 2, weapon: 5, artifact: 0, other: 2 })
    expect(result.unmapped).toEqual({
      characters: ['not_a_character'],
      weapons: ['not_a_weapon'],
      artifacts: [],
      other: [],
    })
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
      // Seelie's craft 0 is no refinement: the copy's stays.
      current: { level: 1, ascension: 0, refinement: 2 },
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

const artifactSets = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)

describe('Seelie weapon slugs that are older or other names', () => {
  it('maps every one of them', () => {
    const slugs: Record<string, string> = {
      crossing_of_fleuve_cendre: 'FleuveCendreFerryman',
      demon_slayer_bow: 'Hamayumi',
      brumal_star: 'PolarStar',
      trawler: 'EndOfTheLine',
      blackcliff_amulet: 'BlackcliffAgate',
      fumetsu_gekka: 'EverlastingMoonglow',
      prototype_malice: 'PrototypeAmber',
      white_dragon_ring: 'HakushinRing',
      katsuragis_slasher: 'KatsuragikiriNagamasa',
      prototype_aminus: 'PrototypeArchaic',
      snow_tombed_starsliver: 'SnowTombedStarsilver',
      prototype_grudge: 'PrototypeStarglitter',
      amenoma_kageuta_blade: 'AmenomaKageuchi',
      cursed_blade: 'KagotsurubeIsshin',
    }
    for (const [slug, key] of Object.entries(slugs)) expect(keys.weapon(slug)).toBe(key)
  })
})

describe('Seelie current values, constellations and notes', () => {
  const result = mapSeelieGoals(
    { ...fixture, notes: { hutao: '  C1 first  ', kaeya: 'x' } },
    planner,
    context,
  )
  const entry = (key: string) => result.characters.find((c) => c.key === key)

  it('reads the current levels and talents, the account ones where the file has none', () => {
    expect(entry('HuTao')?.current).toEqual({
      level: 80,
      ascension: 5,
      talents: { auto: 6, skill: 8, burst: 8 },
    })
    // Raiden: only a talent goal, with the normal attack's current level.
    expect(entry('RaidenShogun')?.current).toEqual({
      level: 90,
      ascension: 6,
      talents: { auto: 1, skill: 9, burst: 10 },
    })
    expect(entry('TravelerCryo')?.current).toBeUndefined()
  })

  it('takes cons as the constellation and notes by character', () => {
    expect(entry('HuTao')?.constellation).toBe(1)
    expect(entry('RaidenShogun')?.constellation).toBeUndefined()
    expect(entry('HuTao')?.note).toBe('C1 first')
    expect(entry('RaidenShogun')?.note).toBeUndefined()
  })
})

describe('Seelie artifact goals', () => {
  const file = {
    goals: [
      {
        type: 'artifact',
        character: 'hutao',
        artifacts: ['crimson_witch_of_flames', 'seal_of_insulation', 'long_night', 'not_a_set'],
        sands: 'hp_p',
        goblet: 'pyro_dmg',
        circlet: 'crit_rate_dmg_p',
        done: { crimson_witch_of_flames: true },
        id: 1,
      },
      { type: 'artifact', character: 'kazuha', artifacts: [], sands: 'elemental_mastery', id: 2 },
    ],
  }
  const result = mapSeelieGoals(file, planner, { ...context, artifactSets })

  it('maps sets (with their done tick) and main stats onto the character goal', () => {
    expect(result.read.artifact).toBe(2)
    const hutao = result.characters.find((c) => c.key === 'HuTao')!
    expect(hutao.artifacts).toEqual({
      sets: [
        { key: 'CrimsonWitchOfFlames', done: true },
        { key: 'EmblemOfSeveredFate' },
        { key: 'LongNightsOath' },
      ],
      sands: ['hp_'],
      goblet: ['pyro_dmg_'],
      circlet: ['critRate_', 'critDMG_'],
    })
    // No level goal in the file: the levels stay where the character is.
    expect(hutao.target).toMatchObject({ level: 80, ascension: 5 })
    expect(result.characters.find((c) => c.key === 'KaedeharaKazuha')?.artifacts).toEqual({
      sets: [],
      sands: ['eleMas'],
    })
    expect(result.unmapped.artifacts).toEqual(['not_a_set'])
  })

  it('reports every set when the planner knows none', () => {
    const bare = mapSeelieGoals(file, planner, context)
    expect(bare.characters.find((c) => c.key === 'HuTao')?.artifacts?.sets).toEqual([])
    expect(bare.unmapped.artifacts).toHaveLength(4)
  })
})

describe('Seelie custom characters', () => {
  const file = {
    goals: [
      {
        type: 'character',
        character: 'custom-k3j9xz',
        current: { level: 20, asc: 1 },
        goal: { level: 80, asc: 6 },
        id: 1,
      },
      {
        type: 'talent',
        character: 'custom-k3j9xz',
        normal: { current: 1, goal: 6 },
        skill: { current: 2, goal: 9 },
        burst: { current: 1, goal: 9 },
        id: 2,
      },
      {
        type: 'weapon',
        character: 'custom-k3j9xz',
        weapon: 'freedom-sworn',
        goal: { level: 90, asc: 6 },
        id: 3,
      },
    ],
    customs: {
      'custom-k3j9xz': {
        custom: 'character',
        name: 'Windy',
        tier: 5,
        element: 'anemo',
        weapon: 'sword',
        element_1: 'vayuda_turqoise',
        element_2: 'maguu_kishin',
        local: 'sea_ganoderma',
        common: 'th_insignia',
        talent: 'diligence',
        boss: 'gilded_scale',
      },
      'custom-1x2y3z': {
        custom: 'character',
        name: 'Later',
        tier: 4,
        element_1: 'agnidus_agate',
        weapon: 'bow',
        talent: 'no_such_book',
      },
    },
    inactive: { 'custom-1x2y3z': true },
  }
  const result = mapSeelieGoals(file, planner, context)

  it('keeps ids readable and stable', () => {
    expect(customKeyFromSeelie('custom-k3j9xz')).toBe('k3j9xz')
    expect(customKeyFromSeelie('custom-1x2y3z')).toBe('c1x2y3z')
    expect(customKeyFromSeelie('custom-cabc12345678')).toBe('cabc12345678')
    const short = customKeyFromSeelie('custom-ab')
    expect(short).toMatch(/^c[0-9a-z]{7}$/)
    expect(customKeyFromSeelie('custom-ab')).toBe(short)
  })

  it('maps what they are, with their goals and weapon goals', () => {
    expect(result.characters).toEqual([])
    const windy = result.customs.find((c) => c.key === 'k3j9xz')!
    expect(windy.custom).toEqual({
      name: 'Windy',
      rarity: 5,
      element: 'Anemo',
      weapon: 'sword',
      book: 'TeachingsOfDiligence',
      common: 'TreasureHoarderInsignia',
      boss: 'MarionetteCore',
      local: 'SeaGanoderma',
      weekly: 'GildedScale',
    })
    expect(windy.target).toEqual({
      level: 80,
      ascension: 6,
      talents: { auto: 6, skill: 9, burst: 9 },
      active: true,
    })
    expect(windy.current).toEqual({
      level: 20,
      ascension: 1,
      talents: { auto: 1, skill: 2, burst: 1 },
    })
    expect(result.weapons).toEqual([
      expect.objectContaining({ key: 'FreedomSworn', owner: 'k3j9xz' }),
    ])
  })

  it('brings one without goals along, its element from its gem', () => {
    const later = result.customs.find((c) => c.key === 'c1x2y3z')!
    expect(later.custom).toEqual({ name: 'Later', rarity: 4, element: 'Pyro', weapon: 'bow' })
    expect(later.target).toMatchObject({ level: 1, ascension: 0, active: false })
    expect(result.unmapped.other).toEqual(['talent/no_such_book'])
  })
})

describe('Seelie weapon goals: duplicates, current values and refinement', () => {
  const file = {
    goals: [
      {
        type: 'weapon',
        character: 'bennett',
        weapon: 'favonius_sword',
        current: { level: 90, asc: 6, craft: 3 },
        goal: { level: 90, asc: 6, craft: 5 },
        id: 1,
      },
      {
        type: 'weapon',
        character: 'bennett',
        weapon: 'favonius_sword',
        goal: { level: 70, asc: 4, craft: 0 },
        id: 2,
      },
      { type: 'weapon', weapon: 'favonius_sword', goal: { level: 50, asc: 2 }, id: 3 },
    ],
    inactive: { '2': true },
  }
  const result = mapSeelieGoals(file, planner, context)

  it('keeps both goals of one weapon in file order, and the spare', () => {
    expect(result.weapons).toEqual([
      {
        key: 'FavoniusSword',
        owner: 'Bennett',
        target: { level: 90, ascension: 6, refinement: 5, active: true },
        current: { level: 90, ascension: 6, refinement: 3 },
      },
      {
        key: 'FavoniusSword',
        owner: 'Bennett',
        target: { level: 70, ascension: 4, refinement: 1, active: false },
      },
      {
        key: 'FavoniusSword',
        owner: '',
        target: { level: 50, ascension: 2, refinement: 1, active: true },
      },
    ])
  })
})
