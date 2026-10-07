import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { emptyRequirement, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import { allocatedTotals } from '../allocated-totals'
import { allocateNeeds, createAllocationMemo } from '../allocation'
import {
  focusChips,
  focusRows,
  goalAmounts,
  materialGroups,
  materialOption,
  materialUses,
  optionName,
  requirementOptions,
  searchMaterialGroups,
} from '../material-filter'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const name = (key: string) => planner.materialsByKey.get(key)?.name ?? key
const option = (key: string) => materialOption(planner, key)!

const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
})

// Hu Tao above Diluc: both Pyro (Agnidus Agate), Hu Tao and Xiangling share Diligence
// books; The Catch (a weapon goal) wants weapon EXP and its own materials; Bennett is paused.
const huTao = goal(
  'character:HuTao',
  { AgnidusAgateChunk: 6, AgnidusAgateGemstone: 6, TeachingsOfDiligence: 6, JuvenileJade: 20 },
  { characterExp: 50_000, mora: 100_000 },
)
const diluc = goal(
  'character:Diluc',
  { AgnidusAgateFragment: 3, AgnidusAgateChunk: 6, EverflameSeed: 8 },
  { characterExp: 1_000, mora: 40_000 },
)
const xiangling = goal('character:Xiangling', {
  GuideToDiligence: 9,
  PhilosophiesOfDiligence: 4,
  CrownOfInsight: 1,
})
const theCatch = goal(
  'weapon:TheCatch::1',
  { MaskOfTheWickedLieutenant: 3, ChaosGear: 6 },
  { weaponExp: 25_000, mora: 20_000 },
)
const bennett = goal('character:Bennett', { AgnidusAgateGemstone: 1, PhilosophiesOfDiligence: 2 })
const goals = new Map([huTao, diluc, xiangling, theCatch, bennett].map((g) => [g.id, g]))
const entries = [
  { id: huTao.id, active: true, materialsDone: false },
  { id: diluc.id, active: true, materialsDone: false },
  { id: xiangling.id, active: true, materialsDone: false },
  { id: theCatch.id, active: true, materialsDone: false },
  { id: bennett.id, active: false, materialsDone: false },
  // Everything reached: no cost left.
  { id: 'character:Sucrose', active: true, materialsDone: true },
]

describe('a material option', () => {
  it('is the family for any of its tiers, named and pictured by the highest', () => {
    const gem = option('AgnidusAgateChunk')
    expect(gem.key).toBe('AgnidusAgateSliver')
    expect(gem.kind).toBe('gem')
    expect(gem.face.key).toBe('AgnidusAgateGemstone')
    expect(gem.members.map((m) => m.key)).toEqual([
      'AgnidusAgateSliver',
      'AgnidusAgateFragment',
      'AgnidusAgateChunk',
      'AgnidusAgateGemstone',
    ])
    expect(gem.exp).toBeNull()
    expect(option('GuideToDiligence').key).toBe('TeachingsOfDiligence')
    expect(option('SlimeConcentrate').key).toBe('SlimeCondensate')
    expect(optionName(option('PhilosophiesOfFreedom'), name)).toBe('Philosophies of Freedom')
  })

  it('is the one material when it has no tiers', () => {
    for (const key of ['JuvenileJade', 'JueyunChili', 'DvalinsPlume', 'CrownOfInsight']) {
      const o = option(key)
      expect(o.key).toBe(key)
      expect(o.members.map((m) => m.key)).toEqual([key])
    }
    expect(option('CrownOfInsight').kind).toBe('crown')
  })

  it('is the EXP for any EXP item, keyed by the largest', () => {
    const exp = option('AdventurersExperience')
    expect(exp).toBe(option('WanderersAdvice'))
    expect(exp.key).toBe('HerosWit')
    expect(exp.exp).toBe('character')
    expect(exp.members).toHaveLength(3)
    expect(optionName(exp, name)).toBe('Character EXP')
    const ore = option('EnhancementOre')
    expect(ore.key).toBe('MysticEnhancementOre')
    expect(optionName(ore, name)).toBe('Weapon EXP')
  })

  it('leaves out Mora, the conversion currencies and unknown keys', () => {
    for (const key of ['Mora', 'DreamSolvent', 'DustOfAzoth', 'NotAMaterial']) {
      expect(materialOption(planner, key)).toBeNull()
    }
  })

  it('is the same object every time, for every copy of the planner data', () => {
    expect(option('AgnidusAgateChunk')).toBe(option('AgnidusAgateSliver'))
    expect(materialOption({ ...planner }, 'AgnidusAgateFragment')).toBe(option('AgnidusAgateChunk'))
  })
})

describe('the goals using a material', () => {
  it('reads the options off a remaining cost (EXP included, Mora not)', () => {
    expect([...requirementOptions(planner, huTao.requirement)].sort()).toEqual([
      'AgnidusAgateSliver',
      'HerosWit',
      'JuvenileJade',
      'TeachingsOfDiligence',
    ])
    expect([...requirementOptions(planner, theCatch.requirement)].sort()).toEqual([
      'ChaosGear',
      'MaskOfTheWickedLieutenant',
      'MysticEnhancementOre',
    ])
    expect(requirementOptions(planner, goal('x', { AgnidusAgateChunk: 0 }).requirement).size).toBe(
      0,
    )
  })

  it('counts the counted goals with something left only', () => {
    const uses = materialUses(planner, entries, goals)
    expect([...uses.keys()]).toEqual([huTao.id, diluc.id, xiangling.id, theCatch.id])
    expect(uses.get(diluc.id)?.has('AgnidusAgateSliver')).toBe(true)
    expect(uses.get(xiangling.id)?.has('TeachingsOfDiligence')).toBe(true)
    expect(uses.get(xiangling.id)?.has('CrownOfInsight')).toBe(true)
  })
})

describe('the picker', () => {
  const uses = materialUses(planner, entries, goals)
  const counts = new Map<string, number>()
  for (const set of uses.values()) for (const k of set) counts.set(k, (counts.get(k) ?? 0) + 1)
  const groups = materialGroups(planner, uses, counts)

  it('groups the materials in use by kind, in the cards’ order', () => {
    expect(groups.map((g) => g.label)).toEqual([
      'EXP',
      'Gems',
      'Boss drops',
      'Talent books',
      'Weapon materials',
      'Elite drops',
    ])
    const keys = Object.fromEntries(groups.map((g) => [g.id, g.choices.map((c) => c.option.key)]))
    expect(keys.exp).toEqual(['HerosWit', 'MysticEnhancementOre'])
    expect(keys.boss).toEqual(['EverflameSeed', 'JuvenileJade'])
    // The Crown is a talent material.
    expect(keys.book).toEqual(['TeachingsOfDiligence', 'CrownOfInsight'])
  })

  it('counts the goals using each', () => {
    const count = (key: string) =>
      groups.flatMap((g) => g.choices).find((c) => c.option.key === key)?.count
    expect(count('AgnidusAgateSliver')).toBe(2)
    expect(count('TeachingsOfDiligence')).toBe(2)
    expect(count('HerosWit')).toBe(2)
    expect(count('MysticEnhancementOre')).toBe(1)
    expect(count('CrownOfInsight')).toBe(1)
  })

  it('keeps a picked material no goal uses any more (count 0)', () => {
    const withPicked = materialGroups(planner, uses, counts, 'SlimeCondensate')
    const common = withPicked.find((g) => g.id === 'common')
    expect(common?.choices.map((c) => [c.option.key, c.count])).toEqual([['SlimeCondensate', 0]])
  })

  it('searches names, every tier’s and the groups’', () => {
    const keys = (q: string) =>
      searchMaterialGroups(groups, q, name).flatMap((g) => g.choices.map((c) => c.option.key))
    expect(keys('')).toHaveLength(groups.flatMap((g) => g.choices).length)
    expect(keys('sliver')).toEqual(['AgnidusAgateSliver'])
    expect(keys('guide diligence')).toEqual(['TeachingsOfDiligence'])
    expect(keys('boss')).toEqual(['EverflameSeed', 'JuvenileJade'])
    expect(keys('character exp')).toEqual(['HerosWit'])
    expect(keys('nothing like it')).toEqual([])
  })
})

describe('a goal’s amount', () => {
  it('is each tier of the family it needs', () => {
    const gem = option('AgnidusAgateSliver')
    const amounts = (g: PlanGoal) =>
      goalAmounts(planner, gem, g.requirement).map((a) => [a.material.key, a.count])
    expect(amounts(huTao)).toEqual([
      ['AgnidusAgateChunk', 6],
      ['AgnidusAgateGemstone', 6],
    ])
    expect(amounts(diluc)).toEqual([
      ['AgnidusAgateFragment', 3],
      ['AgnidusAgateChunk', 6],
    ])
    expect(amounts(xiangling)).toEqual([])
  })

  it('is EXP in points and in the largest item, rounded up', () => {
    const [exp] = goalAmounts(planner, option('HerosWit'), huTao.requirement)
    expect(exp).toMatchObject({ count: 3, points: 50_000, exp: 'character' })
    expect(exp!.material.key).toBe('HerosWit')
    const [ore] = goalAmounts(planner, option('EnhancementOre'), theCatch.requirement)
    expect(ore).toMatchObject({ count: 3, points: 25_000, exp: 'weapon' })
    expect(goalAmounts(planner, option('HerosWit'), xiangling.requirement)).toEqual([])
  })

  it('takes the card’s chips for what is short', () => {
    const gem = option('AgnidusAgateSliver')
    const chunk = planner.materialsByKey.get('AgnidusAgateChunk')!
    const hero = planner.materialsByKey.get('HerosWit')!
    const needs = {
      status: 'short' as const,
      chips: [
        { key: 'AgnidusAgateChunk', material: chunk, count: 4, status: 'short' as const },
        // An EXP chip under the same key isn't the gem's.
        {
          key: 'HerosWit',
          material: hero,
          count: 2,
          status: 'alone' as const,
          exp: 'character' as const,
        },
      ],
    }
    const chips = focusChips(planner, gem, huTao.requirement, needs)
    expect(chips.map((c) => [c.material.key, c.count, c.status, c.short])).toEqual([
      ['AgnidusAgateChunk', 6, 'short', 4],
      ['AgnidusAgateGemstone', 6, 'all', 0],
    ])
    const exp = focusChips(planner, option('HerosWit'), huTao.requirement, needs)
    expect(exp.map((c) => [c.count, c.status, c.short])).toEqual([[3, 'alone', 2]])
    expect(focusChips(planner, gem, diluc.requirement, null).map((c) => c.status)).toEqual([
      'all',
      'all',
    ])
  })
})

describe('the line above the cards', () => {
  const bag = {
    AgnidusAgateSliver: 1,
    AgnidusAgateFragment: 4,
    AgnidusAgateChunk: 8,
    AgnidusAgateGemstone: 2,
    HerosWit: 2,
    AdventurersExperience: 1,
    Mora: 10_000_000,
  }
  const memo = createAllocationMemo()
  allocateNeeds(
    planner,
    [huTao, diluc, xiangling, theCatch].map((g) => ({ id: g.id, goal: g, active: true })),
    bag,
    {},
    memo,
  )
  const gem = option('AgnidusAgateSliver')

  it('sums the goals shown, tier by tier, against the bag', () => {
    const totals = allocatedTotals(planner, memo, new Set([huTao.id, diluc.id]))
    const rows = focusRows(gem, totals).map((r) => [r.material.key, r.need, r.have])
    expect(rows).toEqual([
      ['AgnidusAgateFragment', 3, 4],
      ['AgnidusAgateChunk', 12, 8],
      ['AgnidusAgateGemstone', 6, 2],
    ])
    // Short of what crafting can't cover: 4 Chunks and 4 Gemstones, less what the spares craft.
    const missing = Object.fromEntries(
      focusRows(gem, totals).map((r) => [r.material.key, r.missing]),
    )
    expect(missing.AgnidusAgateGemstone).toBeGreaterThan(0)
    expect(missing.AgnidusAgateFragment).toBe(0)
  })

  it('is each goal’s share after the goals above it', () => {
    // Diluc alone: Hu Tao (above) takes the held Chunks first.
    const totals = allocatedTotals(planner, memo, new Set([diluc.id]))
    const chunk = focusRows(gem, totals).find((r) => r.material.key === 'AgnidusAgateChunk')!
    expect(chunk.need).toBe(6)
    expect(chunk.missing).toBeGreaterThan(0)
  })

  it('counts EXP in points', () => {
    const totals = allocatedTotals(planner, memo, new Set([huTao.id, diluc.id]))
    const [row] = focusRows(option('HerosWit'), totals)
    expect(row).toMatchObject({ need: 51_000, have: 2 * 20_000 + 5_000, missing: 6_000 })
    expect(focusRows(option('HerosWit'), allocatedTotals(planner, memo, new Set()))).toEqual([])
  })
})
