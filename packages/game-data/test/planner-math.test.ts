import { describe, expect, it } from 'vitest'
import plannerJson from '../data/planner.json'
import { decodePlanner } from '../src'
import type { PlannerFile } from '../src/format'
import {
  characterRequirement,
  craftFamily,
  createRequirementCache,
  expItemMix,
  findCharacterState,
  findWeaponState,
  isDone,
  levelMilestones,
  msUntilReset,
  normalizeLevel,
  parseDrops,
  planEstimate,
  planTotals,
  serverWeekday,
  sourceGroups,
  weaponRequirement,
  type CharacterState,
  type MaterialLine,
  type PlanGoal,
  type Requirement,
} from '../src/planner-math'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

const state = (level: number, ascension: number, talents = [1, 1, 1]): CharacterState => ({
  level,
  ascension,
  talents: { auto: talents[0]!, skill: talents[1]!, burst: talents[2]! },
})

/** Requirement items as a plain object, for readable expectations. */
const items = (r: Requirement | null) => Object.fromEntries([...(r?.items ?? [])].sort())

function character(key: string, from: CharacterState, to: CharacterState): Requirement {
  const r = characterRequirement(planner, key, from, to)
  if (!r) throw new Error(`no ${key}`)
  return r
}

describe('character requirements', () => {
  it('5★ (Hu Tao) 1 → 90: ascension materials, 420,000 + levelling mora, 8,362,650 EXP', () => {
    const r = character('HuTao', state(1, 0), state(90, 6))
    expect(items(r)).toEqual(
      Object.fromEntries(
        Object.entries({
          AgnidusAgateSliver: 1,
          AgnidusAgateFragment: 9,
          AgnidusAgateChunk: 9,
          AgnidusAgateGemstone: 6,
          JuvenileJade: 46,
          SilkFlower: 168,
          WhopperflowerNectar: 18,
          ShimmeringNectar: 30,
          EnergyNectar: 36,
        }).sort(),
      ),
    )
    expect(r.characterExp).toBe(8_362_650)
    expect(r.mora).toBe(420_000 + 1_672_530)
    expect(r.weaponExp).toBe(0)
  })

  it('4★ (Amber) 1 → 90 costs the same amounts with her own materials', () => {
    const r = character('Amber', state(1, 0), state(90, 6))
    const counts = [...r.items.values()].sort((a, b) => a - b)
    expect(counts).toEqual([1, 6, 9, 9, 18, 30, 36, 46, 168])
    expect(r.items.get('EverflameSeed')).toBe(46)
    expect(r.items.get('SmallLampGrass')).toBe(168)
    expect(r.items.get('FirmArrowhead')).toBe(18)
    expect(r.mora).toBe(420_000 + 1_672_530)
  })

  it('only counts the phases between current and target', () => {
    // 80/5 -> 80+ (phase 6) -> 90: one ascension and the last ten levels.
    const r = character('HuTao', state(80, 5), state(90, 6))
    expect(items(r)).toEqual({
      AgnidusAgateGemstone: 6,
      EnergyNectar: 24,
      JuvenileJade: 20,
      SilkFlower: 60,
    })
    expect(r.characterExp).toBe(planner.characterExp.slice(79, 89).reduce((a, b) => a + b, 0))
    expect(r.mora).toBe(120_000 + Math.ceil(r.characterExp / 5))
  })

  it('a talent 1 → 10 takes 3/21/38 books, 6 weekly drops, a crown and 1,652,500 mora', () => {
    const r = character('HuTao', state(90, 6, [1, 1, 1]), state(90, 6, [10, 1, 1]))
    expect(items(r)).toEqual({
      CrownOfInsight: 1,
      EnergyNectar: 31,
      GuideToDiligence: 21,
      PhilosophiesOfDiligence: 38,
      ShardOfAFoulLegacy: 6,
      ShimmeringNectar: 22,
      TeachingsOfDiligence: 3,
      WhopperflowerNectar: 6,
    })
    expect(r.mora).toBe(1_652_500)
  })

  it('three talents 1 → 10 take three crowns', () => {
    const r = character('HuTao', state(90, 6), state(90, 6, [10, 10, 10]))
    expect(r.items.get('CrownOfInsight')).toBe(3)
    expect(r.items.get('PhilosophiesOfDiligence')).toBe(114)
    expect(r.mora).toBe(3 * 1_652_500)
  })

  it('Geo Traveler normal attack uses Freedom, Resistance and Ballad books', () => {
    const r = character('TravelerGeo', state(90, 6), state(90, 6, [10, 1, 1]))
    const books = Object.fromEntries(
      [...r.items].filter(([key]) => /^(TeachingsOf|GuideTo|PhilosophiesOf)/.test(key)).sort(),
    )
    expect(books).toEqual({
      GuideToBallad: 4,
      GuideToFreedom: 6,
      GuideToResistance: 11,
      PhilosophiesOfBallad: 20,
      PhilosophiesOfFreedom: 6,
      PhilosophiesOfResistance: 12,
      TeachingsOfFreedom: 3,
    })
    expect(r.items.get('DvalinsSigh')).toBe(6)
    expect(r.items.get('CrownOfInsight')).toBe(1)
  })

  it('Manekin and Manekina plan like anyone else', () => {
    const boy = character('Manekin', state(1, 0), state(90, 6, [9, 9, 9]))
    const girl = character('Manekina', state(1, 0), state(90, 6, [9, 9, 9]))
    expect(boy.mora).toBe(girl.mora)
    expect(boy.items.get('CrownOfInsight')).toBeUndefined()
  })

  it('nothing when current ≥ target', () => {
    expect(isDone(character('HuTao', state(90, 6, [9, 9, 9]), state(90, 6, [9, 9, 9])))).toBe(true)
    expect(isDone(character('HuTao', state(90, 6, [10, 10, 10]), state(80, 5, [9, 9, 9])))).toBe(
      true,
    )
    expect(isDone(character('HuTao', state(90, 6), state(90, 6, [1, 1, 2])))).toBe(false)
  })

  it('is null for a character the data lacks (the element-less Traveler)', () => {
    expect(characterRequirement(planner, 'Traveler', state(1, 0), state(90, 6))).toBeNull()
  })
})

describe('levels and phases', () => {
  const phases = planner.characters.get('HuTao')!.ascension

  it('keeps level and ascension consistent with the phase caps', () => {
    expect(normalizeLevel(phases, 80, 6)).toEqual({ level: 80, ascension: 6 })
    expect(normalizeLevel(phases, 90, 0)).toEqual({ level: 90, ascension: 6 })
    expect(normalizeLevel(phases, 50, 2)).toEqual({ level: 50, ascension: 2 })
    expect(normalizeLevel(phases, 1, 6)).toEqual({ level: 80, ascension: 6 })
    expect(normalizeLevel(phases, 120, 9)).toEqual({ level: 90, ascension: 6 })
  })

  it('a target level above its ascension cap includes the phases it needs', () => {
    const r = character('HuTao', state(1, 0), state(90, 0))
    expect(r.items.get('AgnidusAgateGemstone')).toBe(6)
  })

  it('lists the level/ascension milestones', () => {
    expect(levelMilestones(phases).map((m) => `${m.level}/${m.ascension}`)).toEqual([
      '1/0',
      '20/0',
      '20/1',
      '40/1',
      '40/2',
      '50/2',
      '50/3',
      '60/3',
      '60/4',
      '70/4',
      '70/5',
      '80/5',
      '80/6',
      '90/6',
    ])
  })
})

describe('weapon requirements', () => {
  const weapon = (key: string, to = 90, asc = 6) => {
    const r = weaponRequirement(
      planner,
      key,
      { level: 1, ascension: 0 },
      { level: to, ascension: asc },
    )
    if (!r) throw new Error(`no ${key}`)
    return r
  }
  const tiers = (r: Requirement) => [...r.items.values()]

  it('5★ 1 → 90: 9,064,450 EXP (907 Mystic ores), 225,000 ascension mora', () => {
    const r = weapon('StaffOfHoma')
    expect(r.weaponExp).toBe(9_064_450)
    expect(r.mora).toBe(225_000 + 906_445)
    // Domain 5/14/14/6, elite 23/27/41, common 15/23/27.
    expect(items(r)).toEqual({
      BitOfAerosiderite: 14,
      ChunkOfAerosiderite: 6,
      DeadLeyLineBranch: 23,
      DeadLeyLineLeaves: 27,
      GrainOfAerosiderite: 5,
      LeyLineSprout: 41,
      PieceOfAerosiderite: 14,
      SlimeConcentrate: 27,
      SlimeCondensate: 15,
      SlimeSecretions: 23,
    })
  })

  it('4★ and 3★ 1 → 90: 6,042,650 / 3,988,200 EXP, 150,000 / 105,000 ascension mora', () => {
    const four = weapon('FavoniusSword')
    expect(four.weaponExp).toBe(6_042_650)
    expect(four.mora).toBe(150_000 + 604_265)
    expect(tiers(four).reduce((a, b) => a + b, 0)).toBe(3 + 9 + 9 + 4 + 15 + 18 + 27 + 10 + 15 + 18)
    const three = weapon('CoolSteel')
    expect(three.weaponExp).toBe(3_988_200)
    expect(three.mora).toBe(105_000 + 398_820)
  })

  it('1-2★ weapons stop at 70', () => {
    const two = weapon('SilverSword', 90, 6)
    expect(two.weaponExp).toBe(1_079_675)
    expect(two.mora).toBe(35_000 + 107_968)
    const one = weapon('DullBlade', 70, 4)
    expect(one.weaponExp).toBe(719_875)
  })

  it('nothing when already there', () => {
    const r = weaponRequirement(
      planner,
      'StaffOfHoma',
      { level: 90, ascension: 6 },
      { level: 80, ascension: 5 },
    )
    expect(r && isDone(r)).toBe(true)
  })
})

describe('EXP items', () => {
  it('fewest books with under one small book of waste', () => {
    const mix = expItemMix(8_362_650, planner.expItems.character)
    expect(mix.map((m) => [m.material.key, m.count])).toEqual([
      ['HerosWit', 418],
      ['WanderersAdvice', 3],
    ])
    expect(expItemMix(10_000, planner.expItems.character).map((m) => m.count)).toEqual([2])
    expect(expItemMix(0, planner.expItems.character)).toEqual([])
  })
})

describe('totals against an inventory', () => {
  const goal = (id: string, r: Requirement | null, active = true): PlanGoal => ({
    id,
    requirement: r!,
    active,
  })
  const talentOnly = (key: string, to: number) =>
    characterRequirement(planner, key, state(90, 6), state(90, 6, [to, 1, 1]))

  it('9 green → 3 blue → 1 purple covers a purple book, and pays the crafting mora', () => {
    const r = character('HuTao', state(90, 6, [9, 1, 1]), state(90, 6, [9, 1, 1]))
    r.items.set('PhilosophiesOfDiligence', 1)
    const totals = planTotals(planner, [goal('a', r)], { TeachingsOfDiligence: 9 })
    const line = (key: string) => totals.lines.get(key)!
    expect(line('PhilosophiesOfDiligence')).toMatchObject({
      need: 1,
      have: 0,
      crafted: 1,
      missing: 0,
    })
    expect(line('GuideToDiligence')).toMatchObject({ need: 0, crafted: 3, spent: 3, missing: 0 })
    expect(line('TeachingsOfDiligence')).toMatchObject({ need: 0, have: 9, spent: 9, missing: 0 })
    expect(totals.mora.crafting).toBe(3 * 175 + 550)
  })

  it('8 green are not enough for a purple; no crafting is paid for', () => {
    const r = character('HuTao', state(90, 6), state(90, 6))
    r.items.set('PhilosophiesOfDiligence', 1)
    const totals = planTotals(planner, [goal('a', r)], { TeachingsOfDiligence: 8 })
    expect(totals.lines.get('PhilosophiesOfDiligence')!.missing).toBe(1)
    expect(totals.mora.crafting).toBe(0)
  })

  it('a tier needs its own stock first; spares above cannot fill a lower tier', () => {
    const tiers = planner.families
      .find((f) => f.key === 'TeachingsOfDiligence')!
      .members.map(
        (material, i): MaterialLine => ({
          material,
          need: [5, 2, 1][i]!,
          have: [11, 1, 4][i]!,
          crafted: 0,
          spent: 0,
          missing: 0,
          goals: [],
        }),
      )
    const mora = craftFamily(tiers, [175, 550])
    // green: 11 - 5 = 6 spare -> 2 blue; blue: 1 + 1 crafted covers 2.
    expect(tiers.map((t) => [t.crafted, t.spent, t.missing])).toEqual([
      [0, 3, 0],
      [1, 0, 0],
      [0, 0, 0],
    ])
    expect(mora).toBe(175)
    const short = tiers.map((t, i) => ({ ...t, need: [5, 0, 0][i]!, have: [0, 0, 9][i]! }))
    craftFamily(short, [175, 550])
    expect(short[0]!.missing).toBe(5)
  })

  it('families without a recipe do not craft (Brilliant Diamond)', () => {
    const r = character('TravelerGeo', state(80, 5), state(80, 6))
    const totals = planTotals(planner, [goal('a', r)], { BrilliantDiamondChunk: 30 })
    expect(totals.lines.get('BrilliantDiamondGemstone')!.missing).toBe(6)
  })

  it('compares EXP with the books held and lists the books to farm', () => {
    const r = character('HuTao', state(1, 0), state(90, 6))
    const none = planTotals(planner, [goal('a', r)], {})
    expect(none.characterExp).toMatchObject({ need: 8_362_650, have: 0, missing: 8_362_650 })
    expect(none.characterExp.missingItems.map((m) => m.count)).toEqual([418, 3])
    const plenty = planTotals(planner, [goal('a', r)], {
      HerosWit: 400,
      AdventurersExperience: 100,
    })
    expect(plenty.characterExp).toMatchObject({ have: 8_500_000, missing: 0, missingItems: [] })
    expect(none.mora).toMatchObject({ need: r.mora, have: 0, missing: r.mora })
  })

  it('leaves inactive goals out and records who needs what', () => {
    const a = talentOnly('HuTao', 10)
    const b = talentOnly('Xiao', 10)
    const totals = planTotals(planner, [goal('hutao', a), goal('xiao', b, false)], {
      CrownOfInsight: 0,
    })
    expect(totals.lines.get('CrownOfInsight')).toMatchObject({ need: 1, goals: ['hutao'] })
    expect(totals.mora.need).toBe(1_652_500)
  })

  it('groups what is missing by where it drops, with the domain days', () => {
    const totals = planTotals(
      planner,
      [goal('hutao', character('HuTao', state(1, 0), state(90, 6, [10, 1, 1])))],
      {},
    )
    const groups = sourceGroups(totals)
    expect(groups.map((g) => g.kind)).toEqual([
      'talent',
      'weekly',
      'boss',
      'gem',
      'local',
      'enemy',
      'crown',
    ])
    const books = groups[0]!
    expect(books).toMatchObject({
      name: 'Diligence',
      domain: expect.stringMatching(/^Domain of Mastery: /),
      weekdays: [2, 5, 0],
      goals: ['hutao'],
      missing: 62,
      missingUnits: 3 + 21 * 3 + 38 * 9,
      estimate: null,
    })
    expect(groups.find((g) => g.kind === 'gem')!.name).toBe('Agnidus Agate')
    expect(planEstimate(groups)).toBeNull()
  })

  it('estimates runs and resin only for sources with a drop rate', () => {
    const totals = planTotals(
      planner,
      [goal('hutao', character('HuTao', state(90, 6), state(90, 6, [10, 1, 1])))],
      {},
    )
    const rates = parseDrops({
      $comment: 'ignored',
      TeachingsOfDiligence: { perRun: 7, resin: 20 },
      broken: { perRun: 'x' },
    })
    expect([...rates.keys()]).toEqual(['TeachingsOfDiligence'])
    const groups = sourceGroups(totals, rates)
    const books = groups.find((g) => g.kind === 'talent')!
    expect(books.estimate).toEqual({ runs: Math.ceil(408 / 7), resin: Math.ceil(408 / 7) * 20 })
    expect(planEstimate(groups)).toEqual({
      resin: books.estimate!.resin,
      days: Math.ceil(books.estimate!.resin / 180),
      partial: true,
    })
  })
})

describe('memoised requirements', () => {
  it('returns the same object for the same numbers', () => {
    const cache = createRequirementCache(planner)
    const a = cache.character('HuTao', state(1, 0), state(90, 6))
    expect(cache.character('HuTao', state(1, 0), state(90, 6))).toBe(a)
    expect(cache.character('HuTao', state(20, 0), state(90, 6))).not.toBe(a)
    const w = cache.weapon(
      'StaffOfHoma',
      { level: 1, ascension: 0, refinement: 1 },
      {
        level: 90,
        ascension: 6,
        refinement: 5,
      },
    )
    expect(w?.weaponExp).toBe(9_064_450)
  })
})

describe('current state', () => {
  const roster = [
    { key: 'TravelerGeo', level: 90, ascension: 6, talent: { auto: 6, skill: 8, burst: 8 } },
    { key: 'HuTao', level: 80, ascension: 5, talent: { auto: 9, skill: 9, burst: 9 } },
  ]

  it('reads characters, sharing the Traveler level across elements', () => {
    expect(findCharacterState(roster, 'HuTao')).toEqual({
      state: state(80, 5, [9, 9, 9]),
      owned: true,
    })
    expect(findCharacterState(roster, 'TravelerGeo').state.talents.skill).toBe(8)
    expect(findCharacterState(roster, 'TravelerCryo')).toEqual({ state: state(90, 6), owned: true })
    expect(findCharacterState(roster, 'Xiao')).toEqual({ state: state(1, 0), owned: false })
  })

  it('reads weapons: the owner’s copy, else the best spare, else a new one', () => {
    const weapons = [
      { key: 'StaffOfHoma', level: 90, ascension: 6, refinement: 1, location: 'HuTao' },
      { key: 'StaffOfHoma', level: 20, ascension: 0, refinement: 2, location: '' },
      { key: 'StaffOfHoma', level: 40, ascension: 1, refinement: 1, location: '' },
    ]
    expect(findWeaponState(weapons, 'StaffOfHoma', 'HuTao').state.level).toBe(90)
    expect(findWeaponState(weapons, 'StaffOfHoma', '').state.level).toBe(40)
    expect(findWeaponState(weapons, 'StaffOfHoma', 'Xiao').state.level).toBe(40)
    expect(findWeaponState(weapons, 'CoolSteel', '')).toEqual({
      state: { level: 1, ascension: 0, refinement: 1 },
      owned: false,
    })
  })
})

describe('domain days', () => {
  // 2026-10-05 is a Monday.
  const at = (iso: string) => Date.parse(iso)

  it('turns the day at 04:00 server time', () => {
    expect(serverWeekday(at('2026-10-05T19:59:00Z'), 'ASIA')).toBe(1)
    expect(serverWeekday(at('2026-10-05T20:00:00Z'), 'ASIA')).toBe(2)
    expect(serverWeekday(at('2026-10-05T20:00:00Z'), 'SAR')).toBe(2)
    expect(serverWeekday(at('2026-10-05T08:59:00Z'), 'AMERICA')).toBe(0)
    expect(serverWeekday(at('2026-10-05T09:00:00Z'), 'AMERICA')).toBe(1)
    expect(serverWeekday(at('2026-10-05T02:59:00Z'), 'EUROPE')).toBe(0)
    expect(serverWeekday(at('2026-10-05T03:00:00Z'), 'EUROPE')).toBe(1)
  })

  it('counts down to the next reset', () => {
    expect(msUntilReset(at('2026-10-05T19:00:00Z'), 'ASIA')).toBe(3_600_000)
    expect(msUntilReset(at('2026-10-05T20:00:00Z'), 'ASIA')).toBe(86_400_000)
  })
})
