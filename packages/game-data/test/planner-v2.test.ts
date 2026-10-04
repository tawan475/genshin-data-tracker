import { describe, expect, it } from 'vitest'
import dropsJson from '../overrides/drops.json'
import plannerJson from '../data/planner.json'
import { decodePlanner } from '../src'
import { parseDropRates } from '../src/drops'
import type { PlannerFile } from '../src/format'
import { craftingSteps } from '../src/planner-convert'
import {
  daysFor,
  domainSchedule,
  farmPlan,
  goalEstimate,
  resinNow,
  tieredRuns,
  todayPlan,
} from '../src/planner-estimate'
import {
  affordable,
  clampTalents,
  goalStatus,
  nextCharacterStep,
  nextWeaponStep,
  raiseForTalents,
} from '../src/planner-goals'
import {
  boostedTalents,
  characterRequirement,
  emptyRequirement,
  itemGoal,
  itemRequirement,
  passiveDiscount,
  planTotals,
  weaponRequirement,
  type CharacterState,
  type PlanGoal,
  type Requirement,
} from '../src/planner-math'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const drops = parseDropRates(dropsJson).rates

const state = (level: number, ascension: number, talents = [1, 1, 1]): CharacterState => ({
  level,
  ascension,
  talents: { auto: talents[0]!, skill: talents[1]!, burst: talents[2]! },
})
const character = (key: string, from: CharacterState, to: CharacterState): Requirement => {
  const r = characterRequirement(planner, key, from, to)
  if (!r) throw new Error(`no ${key}`)
  return r
}
const needs = (items: Record<string, number>): Requirement => {
  const r = emptyRequirement()
  for (const [key, count] of Object.entries(items)) r.items.set(key, count)
  return r
}
const goal = (id: string, requirement: Requirement, active = true): PlanGoal => ({
  id,
  requirement,
  active,
})

describe('talent caps', () => {
  it('a goal’s talents raise the ascension it is costed at (A3 with talent 9 costs A6 and level 80)', () => {
    const raised = character('HuTao', state(1, 0), state(50, 3, [9, 1, 1]))
    const valid = characterRequirement(planner, 'HuTao', state(1, 0), state(80, 6, [9, 1, 1]), {
      talentCaps: false,
    })!
    expect(raised).toEqual(valid)
    expect(raised.ascension).toBe(6)
    expect(raised.ar).toBe(50)
    expect(raised.items.get('AgnidusAgateGemstone')).toBe(6)
    const asIs = characterRequirement(planner, 'HuTao', state(1, 0), state(50, 3, [9, 1, 1]), {
      talentCaps: false,
    })!
    expect(asIs.items.get('AgnidusAgateGemstone')).toBeUndefined()
    expect(asIs.ar).toBe(30)
  })

  it('raises or clamps a target in the editor', () => {
    const phases = planner.characters.get('HuTao')!.ascension
    const target = state(50, 2, [9, 6, 1])
    expect(raiseForTalents(phases, target, planner.talentAscension)).toEqual({
      target: state(80, 6, [9, 6, 1]),
      raised: 6,
    })
    expect(raiseForTalents(phases, state(90, 6, [10, 10, 10])).raised).toBeNull()
    expect(clampTalents(target, planner.talentAscension)).toEqual({
      target: state(50, 2, [2, 2, 1]),
      clamped: true,
    })
  })

  it('shows constellation-boosted talent levels', () => {
    const base = { auto: 9, skill: 9, burst: 9 }
    expect(boostedTalents(planner, 'Neuvillette', base, 3)).toEqual({
      auto: 12,
      skill: 9,
      burst: 9,
    })
    expect(boostedTalents(planner, 'Neuvillette', base, 6)).toEqual({
      auto: 12,
      skill: 9,
      burst: 12,
    })
    expect(boostedTalents(planner, 'Aloy', base, 6)).toEqual(base)
  })
})

describe('item goals', () => {
  it('counts Mora as Mora, books and ores as EXP, anything else as the item', () => {
    expect(itemRequirement(planner, 'Mora', 5000).mora).toBe(5000)
    expect(itemRequirement(planner, 'HerosWit', 2).characterExp).toBe(40_000)
    expect(itemRequirement(planner, 'MysticEnhancementOre', 3).weaponExp).toBe(30_000)
    expect([...itemRequirement(planner, 'DreamSolvent', 4).items]).toEqual([['DreamSolvent', 4]])
  })

  it('adds to the totals like any goal', () => {
    const totals = planTotals(
      planner,
      [
        itemGoal(planner, 'GuideToDiligence', { count: 5 }),
        itemGoal(planner, 'Mora', { count: 1000, active: false }),
      ],
      { TeachingsOfDiligence: 9 },
    )
    expect(totals.lines.get('GuideToDiligence')).toMatchObject({
      need: 5,
      crafted: 3,
      missing: 2,
      goals: ['item:GuideToDiligence'],
    })
    expect(totals.mora).toMatchObject({ need: 3 * 175, crafting: 525 })
  })
})

describe('Dream Solvent', () => {
  const dvalin = needs({ DvalinsPlume: 6, DvalinsSigh: 1 })

  it('covers a boss’s shortage with its spare materials, one solvent each (Seelie’s rule)', () => {
    const totals = planTotals(planner, [goal('a', dvalin)], {
      DvalinsClaw: 4,
      DvalinsSigh: 3,
      DreamSolvent: 10,
    })
    expect(totals.lines.get('DvalinsPlume')).toMatchObject({ need: 6, converted: 6, missing: 0 })
    expect(totals.lines.get('DvalinsClaw')).toMatchObject({ need: 0, convertedAway: 4 })
    expect(totals.lines.get('DvalinsSigh')).toMatchObject({ need: 1, convertedAway: 2, missing: 0 })
    expect(totals.solvent).toMatchObject({ need: 6, have: 10, used: 6, missing: 0, blocked: 0 })
    expect(totals.solvent!.bosses[0]).toMatchObject({ possible: 6, blocked: 0, spare: 0 })
  })

  it('reports the conversions the solvent held can’t pay for', () => {
    const totals = planTotals(planner, [goal('a', dvalin)], {
      DvalinsClaw: 4,
      DvalinsSigh: 3,
      DreamSolvent: 4,
    })
    expect(totals.lines.get('DvalinsPlume')!.missing).toBe(2)
    expect(totals.solvent).toMatchObject({ need: 6, used: 4, missing: 2, blocked: 2 })
  })

  it('can be turned off', () => {
    const totals = planTotals(planner, [goal('a', dvalin)], { DvalinsClaw: 4 }, { solvent: false })
    expect(totals.solvent).toBeNull()
    expect(totals.lines.get('DvalinsPlume')!.missing).toBe(6)
  })

  it('keeps the solvent an item goal asks for', () => {
    const totals = planTotals(
      planner,
      [goal('a', dvalin), itemGoal(planner, 'DreamSolvent', { count: 4 })],
      { DvalinsClaw: 4, DvalinsSigh: 3, DreamSolvent: 6 },
    )
    expect(totals.lines.get('DreamSolvent')).toMatchObject({ need: 4, have: 6, missing: 0 })
    expect(totals.solvent).toMatchObject({ need: 6, have: 6, used: 2, missing: 4, blocked: 4 })
  })
})

describe('Dust of Azoth', () => {
  const gemstone = needs({ AgnidusAgateGemstone: 1 })

  it('converts a spare gem of another element, tier for tier', () => {
    const inventory = { VarunadaLazuriteGemstone: 1, DustOfAzoth: 27 }
    expect(planTotals(planner, [goal('a', gemstone)], inventory).azoth).toBeNull()
    const totals = planTotals(planner, [goal('a', gemstone)], inventory, { azoth: true })
    expect(totals.lines.get('AgnidusAgateGemstone')).toMatchObject({ converted: 1, missing: 0 })
    expect(totals.lines.get('VarunadaLazuriteGemstone')).toMatchObject({ convertedAway: 1 })
    expect(totals.azoth).toMatchObject({ need: 27, used: 27, missing: 0, mora: 0 })
    expect(totals.azoth!.conversions.map((c) => [c.from.key, c.to.key, c.count, c.cost])).toEqual([
      ['VarunadaLazuriteGemstone', 'AgnidusAgateGemstone', 1, 27],
    ])
  })

  it('converts lower tiers and crafts them up, with the gems already held', () => {
    // 2 own chunks + 1 converted chunk (9 dust) -> 1 gemstone (2,700 Mora).
    const totals = planTotals(
      planner,
      [goal('a', gemstone)],
      { AgnidusAgateChunk: 2, VarunadaLazuriteChunk: 1, DustOfAzoth: 9 },
      { azoth: true },
    )
    expect(totals.lines.get('AgnidusAgateGemstone')).toMatchObject({ crafted: 1, missing: 0 })
    expect(totals.lines.get('AgnidusAgateChunk')).toMatchObject({ converted: 1, spent: 3 })
    expect(totals.azoth).toMatchObject({ used: 9, mora: 2700 })
    expect(totals.mora.crafting).toBe(2700)
  })

  it('stops at the dust held, and never touches Brilliant Diamond', () => {
    const short = planTotals(
      planner,
      [goal('a', gemstone)],
      { VarunadaLazuriteGemstone: 1, DustOfAzoth: 26 },
      { azoth: true },
    )
    expect(short.lines.get('AgnidusAgateGemstone')!.missing).toBe(1)
    expect(short.azoth).toMatchObject({ need: 27, used: 0, missing: 1 })
    const diamond = planTotals(
      planner,
      [goal('a', gemstone)],
      { BrilliantDiamondGemstone: 3, DustOfAzoth: 100 },
      { azoth: true },
    )
    expect(diamond.lines.get('AgnidusAgateGemstone')!.missing).toBe(1)
  })
})

describe('forging and passives', () => {
  it('forges the missing Mystic ore from the chunks held', () => {
    const totals = planTotals(
      planner,
      [itemGoal(planner, 'MysticEnhancementOre', { count: 3 })],
      { CrystalChunk: 9, AmethystLump: 4 },
      { forge: true },
    )
    expect(totals.forge).toMatchObject({
      count: 3,
      exp: 30_000,
      mora: 150,
      seconds: 540,
      short: 0,
      inputs: [
        { key: 'CrystalChunk', count: 8 },
        { key: 'AmethystLump', count: 4 },
      ],
    })
    expect(totals.weaponExp).toMatchObject({ need: 30_000, missing: 0, missingItems: [] })
    expect(totals.mora).toMatchObject({ need: 150, forging: 150 })
  })

  it('halves weapon ascension Mora with Raiden Shogun (swords, polearms)', () => {
    const sword = weaponRequirement(
      planner,
      'MistsplitterReforged',
      { level: 1, ascension: 0 },
      { level: 90, ascension: 6 },
    )!
    expect(sword).toMatchObject({ weaponType: 'sword', ascensionMora: 225_000, ar: 50 })
    expect(passiveDiscount(planner, sword, new Set(['RaidenShogun']))).toEqual({
      mora: 112_500,
      character: 'RaidenShogun',
    })
    expect(passiveDiscount(planner, sword, new Set(['Wanderer'])).mora).toBe(0)
    const off = planTotals(planner, [goal('w', sword)], {})
    const on = planTotals(planner, [goal('w', sword)], {}, { passives: ['RaidenShogun'] })
    expect(on.mora.need).toBe(off.mora.need - 112_500)
    expect(on.mora.saved).toBe(112_500)
    expect(on.passives!.saved).toEqual([{ character: 'RaidenShogun', mora: 112_500, goals: ['w'] }])
  })

  it('lists what to craft, convert and forge in game, lowest tier first', () => {
    const r = needs({ PhilosophiesOfDiligence: 1, DvalinsPlume: 1 })
    const totals = planTotals(
      planner,
      [goal('a', r), itemGoal(planner, 'MysticEnhancementOre', { count: 1 })],
      { TeachingsOfDiligence: 9, DvalinsClaw: 1, DreamSolvent: 1, CrystalChunk: 4 },
      { forge: true },
    )
    const steps = craftingSteps(planner, totals).map((s) =>
      s.kind === 'forge'
        ? `forge ${s.count} ${s.to.key} from ${s.uses} ${s.input}, ${s.mora} Mora`
        : s.kind === 'convert'
          ? `convert ${s.count} ${s.from.key} -> ${s.to.key} (${s.cost} ${s.via})`
          : `craft ${s.count} ${s.to.key} from ${s.uses} ${s.from.key}, ${s.mora} Mora`,
    )
    expect(steps).toEqual([
      'convert 1 DvalinsClaw -> DvalinsPlume (1 DreamSolvent)',
      'craft 3 GuideToDiligence from 9 TeachingsOfDiligence, 525 Mora',
      'craft 1 PhilosophiesOfDiligence from 3 GuideToDiligence, 550 Mora',
      'forge 1 MysticEnhancementOre from 4 CrystalChunk, 50 Mora',
    ])
  })
})

describe('farming estimates', () => {
  // Hu Tao, one talent 1 -> 10: 3/21/38 Diligence books, 6 Shards (Childe), a crown.
  const talent = character('HuTao', state(90, 6), state(90, 6, [10, 1, 1]))
  const totals = planTotals(planner, [goal('hutao', talent)], {})

  it('counts tiered runs with crafting (the report’s worked example: 107, not 111)', () => {
    // 60 Guides + 100 Philosophies at 2.2 / 1.97 / 0.23 per run.
    expect(tieredRuns([0, 60, 100], [2.2, 1.97, 0.23])).toBe(107)
    expect(tieredRuns([5], [0])).toBe(Infinity)
    expect(tieredRuns([0, 3], [2.5, 1], false)).toBe(3)
    expect(tieredRuns([11], [2.2])).toBe(5)
  })

  it('estimates a talent domain at the tier the AR opens', () => {
    const top = farmPlan(planner, totals, drops, { ar: 45, wl: 8 })
    const books = top.groups.find((g) => g.kind === 'talent')!
    // (3 + 21·3 + 38·9) / (2.2 + 1.98·3 + 0.22·9) = 408 / 10.12 -> 41 runs.
    expect(books.status).toBe('ok')
    expect(books.run).toMatchObject({
      runs: 41,
      resin: 820,
      days: 5,
      condensed: 14,
      resinPerRun: 20,
      bracket: { kind: 'tier', value: 4, ar: 45, assumed: false },
    })
    expect(books.entry!.name).toBe('Taishan Mansion')
    expect(top.domains.map((d) => [d.entry.name, d.run?.runs])).toEqual([['Taishan Mansion', 41]])
    expect(top.assumed).toEqual({ ar: false, wl: false })

    // AR 30 opens tier II (2.5 Teachings + 1 Guide): 408 / 5.5 -> 75 runs.
    const low = farmPlan(planner, totals, drops, { ar: 30, wl: 8 })
    expect(low.groups.find((g) => g.kind === 'talent')!.run).toMatchObject({
      runs: 75,
      bracket: { value: 2 },
    })
    expect(farmPlan(planner, totals, drops, { ar: 20 }).domains[0]!.status).toBe('locked')
    const unknown = farmPlan(planner, totals, drops, {})
    expect(unknown.groups.find((g) => g.kind === 'talent')!.run!.bracket.assumed).toBe(true)
    expect(unknown.assumed.ar).toBe(true)
    expect(farmPlan(planner, totals, null, { ar: 45 }).domains[0]!.status).toBe('no-rate')
  })

  it('pools a weekly boss: runs, weeks, the expected Dream Solvent', () => {
    const plan = farmPlan(planner, totals, drops, { ar: 50, wl: 8 })
    const childe = plan.weekly.find((w) => w.boss?.name === 'Childe')!
    // 6 Shards at 2.1 per claim (level 90): 3 claims; each material gets ~2.1,
    // so ~3.9 Shards must be converted; 3 claims drop ~0.99 solvent.
    expect(childe.run).toMatchObject({
      runs: 3,
      weeks: 3,
      resinMin: 90,
      resinMax: 180,
      bracket: { kind: 'level', value: 90, ar: 50 },
      solvent: { need: 3.9, income: 0.99 },
    })
    expect(plan.weeklyTotal).toMatchObject({
      weeks: 3,
      resin: 90,
      resinMax: 180,
      solvent: { need: 3.9, income: 0.99, held: 0, short: 2.91 },
    })
    expect(farmPlan(planner, totals, drops, { ar: 40 }).weekly[0]!.run!.runs).toBe(6)
    expect(farmPlan(planner, totals, drops, { ar: 35 }).weekly[0]!.status).toBe('locked')
  })

  it('uses the weekly discount on the first three claims of each week', () => {
    const four = needs({
      DvalinsPlume: 2,
      ShardOfAFoulLegacy: 2,
      MoltenMoment: 2,
      MudraOfTheMaleficGeneral: 2,
    })
    const plan = farmPlan(planner, planTotals(planner, [goal('a', four)], {}), drops, { ar: 50 })
    expect(plan.weekly.map((w) => w.run!.runs)).toEqual([1, 1, 1, 1])
    expect(plan.weeklyTotal).toMatchObject({ weeks: 1, resin: 3 * 30 + 60, resinMax: 240 })
  })

  it('estimates Andrius by World Level, and leaves WL 9 out (not on the wiki)', () => {
    const boreas = planTotals(planner, [goal('a', needs({ TailOfBoreas: 6 }))], {})
    const at = (wl: number | null) => farmPlan(planner, boreas, drops, { ar: 60, wl }).weekly[0]!
    expect(at(8).run).toMatchObject({ runs: 3, bracket: { kind: 'wl', value: 8 } })
    expect(at(4).status).toBe('locked')
    expect(at(9).status).toBe('no-rate')
    expect(at(null).run!.bracket).toMatchObject({ value: 8, assumed: true })
  })

  it('estimates normal bosses, gems and ley lines by World Level', () => {
    // Hu Tao 1 -> 90, ascension only.
    const ascend = planTotals(
      planner,
      [goal('a', character('HuTao', state(1, 0), state(90, 6)))],
      {},
    )
    const plan = farmPlan(planner, ascend, drops, { ar: 60, wl: 8 })
    const jade = plan.groups.find((g) => g.kind === 'boss')!
    expect(jade.key).toBe('JuvenileJade')
    expect(jade.run).toMatchObject({ runs: 18, resin: 720, resinPerRun: 40 }) // 46 / 2.5556
    // Gems 1/9/9/6 at 2.1607/1.5961/0.144/0.0141: 271 slivers' worth / 8.6257 -> 32.
    expect(plan.groups.find((g) => g.kind === 'gem')!.run!.runs).toBe(32)
    // 8,362,650 EXP at 122,500; 2,092,530 Mora at 60,000.
    expect(plan.leyLines.exp.run).toMatchObject({ runs: 69, resin: 1380 })
    expect(plan.leyLines.mora.run).toMatchObject({ runs: 35, resin: 700 })
    expect(plan.total).toMatchObject({
      runs: 18 + 69 + 35,
      resin: 720 + 1380 + 700,
      days: Math.ceil(2800 / 180),
      partial: false,
      gems: { runs: 32, resin: 1280 },
    })
    expect(plan.groups.find((g) => g.kind === 'local')!.status).toBe('not-farmed')
    const wl9 = farmPlan(planner, ascend, drops, { ar: 60, wl: 9 })
    expect(wl9.groups.find((g) => g.kind === 'boss')!.status).toBe('no-rate')
    expect(wl9.total.partial).toBe(true)
  })

  it('takes the Mora domain runs pay off the ley line runs', () => {
    const both = planTotals(
      planner,
      [goal('a', talent), itemGoal(planner, 'Mora', { count: 2_000_000 })],
      {},
    )
    const plan = farmPlan(planner, both, drops, { ar: 45, wl: 8 })
    expect(plan.leyLines.mora.fromDomains).toBe(41 * 2375)
    expect(plan.leyLines.mora.run!.runs).toBe(Math.ceil((both.mora.missing - 41 * 2375) / 60_000))
  })

  it('estimates one goal on its own', () => {
    const one = goalEstimate(planner, goal('hutao', talent, false), {}, drops, { ar: 45, wl: 8 })
    // 41 domain runs, and (1,652,500 - 41·2,375 Mora from them) / 60,000 -> 26 Blossoms of Wealth.
    expect(one.leyLines.mora.run!.runs).toBe(26)
    expect(one.total.resin).toBe(41 * 20 + 26 * 20)
  })
})

describe('days', () => {
  const books = character('HuTao', state(90, 6), state(90, 6, [10, 1, 1]))
  const plan = farmPlan(planner, planTotals(planner, [goal('a', books)], {}), drops, { ar: 45 })

  it('splits the domains by day pair', () => {
    const schedule = domainSchedule(plan)
    expect(schedule.map((d) => d.days)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ])
    expect(schedule[1]!.domains.map((d) => d.domain.entry.name)).toEqual(['Taishan Mansion'])
    expect(schedule[1]!.run!.runs).toBe(41)
    expect(schedule[0]!.domains).toEqual([])
  })

  it('shows what today’s domains farm (04:00 server reset)', () => {
    // 2026-10-06 is a Tuesday; 2026-10-05 a Monday; 2026-10-11 a Sunday.
    const tuesday = todayPlan(plan, Date.parse('2026-10-06T06:00:00Z'), 'ASIA')
    expect(tuesday).toMatchObject({ weekday: 2, allOpen: false })
    expect(tuesday.domains.map((d) => d.groups.map((g) => g.name))).toEqual([['Diligence']])
    expect(todayPlan(plan, Date.parse('2026-10-05T06:00:00Z'), 'ASIA').domains).toEqual([])
    expect(todayPlan(plan, Date.parse('2026-10-11T06:00:00Z'), 'ASIA')).toMatchObject({
      weekday: 0,
      allOpen: true,
    })
  })
})

describe('resin', () => {
  const at = Date.parse('2026-10-04T12:00:00Z')

  it('regenerates from the snapshot, plus the resin held in items', () => {
    const now = resinNow(
      planner,
      { OriginalResin: 100, FragileResin: 2, CondensedResin: 1 },
      at,
      at + 80 * 60_000,
    )
    expect(now).toMatchObject({
      known: true,
      atSnapshot: 100,
      original: 110,
      fullAt: at + 100 * 8 * 60_000,
      bag: 180,
      total: 290,
    })
    const full = resinNow(planner, { OriginalResin: 210 }, at, at + 3_600_000)
    expect(full).toMatchObject({ original: 210, fullAt: null })
    expect(resinNow(planner, {}, at, at).known).toBe(false)
    expect(daysFor(820, 290)).toBe(3)
  })
})

describe('goal status and next step', () => {
  const ascend = character('HuTao', state(1, 0), state(20, 1))
  const a = goal('a', ascend)
  const b = goal('b', character('HuTao', state(1, 0), state(20, 1)))

  it('says whether the stock covers all goals, this goal alone, or not even that', () => {
    const inventory: Record<string, number> = { HerosWit: 100, Mora: 10_000_000 }
    for (const [key, count] of ascend.items) inventory[key] = count
    const all = planTotals(planner, [a, b], inventory)
    const status = goalStatus(planner, a, inventory, { all })
    expect(status.characterExp).toBe('all')
    expect(status.mora).toBe('all')
    expect(status.items.get('AgnidusAgateSliver')).toBe('alone')
    expect(status.overall).toBe('alone')
    expect(goalStatus(planner, a, {}, { goals: [a, b] }).overall).toBe('short')
  })

  it('finds the furthest step the stock reaches now', () => {
    const r = character('HuTao', state(1, 0), state(40, 1))
    const inventory: Record<string, number> = {
      Mora: r.mora,
      HerosWit: Math.ceil(r.characterExp / 20_000),
    }
    for (const [key, count] of r.items) inventory[key] = count
    expect(affordable(planner, r, inventory)).toBe(true)
    const step = nextCharacterStep(
      planner,
      'HuTao',
      state(1, 0),
      state(90, 6, [9, 9, 9]),
      inventory,
    )
    expect(step).toMatchObject({ state: state(40, 1), full: false, stop: 'stock' })
    const lowAr = nextCharacterStep(planner, 'HuTao', state(1, 0), state(90, 6), inventory, {
      ar: 10,
    })
    expect(lowAr).toMatchObject({ state: state(20, 0), stop: 'ar' })
    expect(nextCharacterStep(planner, 'HuTao', state(1, 0), state(90, 6), {})).toBeNull()
    expect(
      nextWeaponStep(
        planner,
        'StaffOfHoma',
        { level: 1, ascension: 0, refinement: 1 },
        { level: 90, ascension: 6 },
        {},
      ),
    ).toBeNull()
  })

  it('levels talents when the stock allows, within the ascension’s cap', () => {
    const r = character('HuTao', state(90, 6), state(90, 6, [3, 1, 1]))
    const inventory: Record<string, number> = { Mora: r.mora }
    for (const [key, count] of r.items) inventory[key] = count
    const step = nextCharacterStep(
      planner,
      'HuTao',
      state(90, 6),
      state(90, 6, [9, 1, 1]),
      inventory,
    )
    expect(step).toMatchObject({ state: state(90, 6, [3, 1, 1]), full: false, stop: 'stock' })
    const done = nextCharacterStep(
      planner,
      'HuTao',
      state(90, 6),
      state(90, 6, [3, 1, 1]),
      inventory,
    )
    expect(done).toMatchObject({ full: true, stop: null })
  })
})
