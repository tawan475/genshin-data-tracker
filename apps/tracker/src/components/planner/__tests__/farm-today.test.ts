import { decodePlanner } from '@gdt/game-data'
import dropsJson from '@gdt/game-data/data/drops.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import { parseDropRates } from '@gdt/game-data/drops'
import type { PlannerFile } from '@gdt/game-data/format'
import { farmPlan } from '@gdt/game-data/planner-estimate'
import { emptyRequirement, planTotals, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import {
  dailyResin,
  farmDay,
  farmHeadline,
  goalsOf,
  resinDays,
  scheduleDays,
  todaySections,
  type FarmInput,
} from '../farm-today'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const { rates: drops } = parseDropRates(dropsJson)

const first = (kind: string) => {
  const m = [...planner.materialsByKey.values()].find((x) => x.kind === kind && x.tier <= 1)
  if (!m) throw new Error(`no ${kind} material`)
  return m.key
}
const LOCAL = first('local')
const ELITE = first('elite')

const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
})

// Freedom: Mon/Thu, Ballad: Wed/Sat (both Forsaken Rift); Decarabian: Mon/Thu (Cecilia Garden).
const amber = goal(
  'character:Amber',
  {
    TeachingsOfFreedom: 9,
    HurricaneSeed: 4,
    VayudaTurquoiseSliver: 1,
    SlimeCondensate: 6,
    [LOCAL]: 10,
    DvalinsPlume: 2,
    CrownOfInsight: 1,
  },
  { characterExp: 100_000, mora: 1_000_000 },
)
const lisa = goal('character:Lisa', { TeachingsOfBallad: 6, SlimeCondensate: 3 })
const favonius = goal(
  'weapon:FavoniusSword:Lisa',
  { TileOfDecarabiansTower: 5, [ELITE]: 4 },
  { weaponExp: 50_000 },
)

function input(options: { ar?: number | null; wl?: number | null; refreshes?: number } = {}) {
  const totals = planTotals(planner, [amber, lisa, favonius], {})
  const ar = options.ar === undefined ? 60 : options.ar
  const wl = options.wl === undefined ? 8 : options.wl
  return {
    planner,
    plan: farmPlan(planner, totals, drops, { ar, wl }),
    totals,
    drops,
    ar,
    wl,
    refreshes: options.refreshes ?? 0,
  } satisfies FarmInput
}

const domainCards = (i: FarmInput, weekday: number) =>
  todaySections(i, weekday)
    .find((s) => s.key === 'domain')!
    .cards.filter((c) => c.kind === 'domain')

const linesOf = (card: { lines: { material: { key: string } }[] }) =>
  card.lines.map((l) => l.material.key)

describe('resin a day', () => {
  it('is 180 plus 60 per refresh, 0 to 6 refreshes', () => {
    expect(dailyResin(0)).toBe(180)
    expect(dailyResin(1)).toBe(240)
    expect(dailyResin(6)).toBe(540)
    expect(dailyResin(9)).toBe(540)
    expect(dailyResin(-2)).toBe(180)
  })

  it('counts days rounded up', () => {
    expect(resinDays(0)).toBe(0)
    expect(resinDays(180)).toBe(1)
    expect(resinDays(181)).toBe(2)
    expect(resinDays(360, 1)).toBe(2)
    expect(resinDays(480, 1)).toBe(2)
    expect(resinDays(481, 1)).toBe(3)
  })
})

describe('the game day on the server', () => {
  // Monday 2026-10-05.
  const MON_1930Z = Date.UTC(2026, 9, 5, 19, 30)
  const MON_2030Z = Date.UTC(2026, 9, 5, 20, 30)

  it('turns at 04:00 server time', () => {
    // Asia (UTC+8): Tuesday 03:30, still Monday, 30 minutes to the reset.
    expect(farmDay(MON_1930Z, 'ASIA')).toEqual({ weekday: 1, msUntilReset: 30 * 60_000 })
    // An hour later it is Tuesday in Asia, still Monday in America and Europe.
    expect(farmDay(MON_2030Z, 'ASIA').weekday).toBe(2)
    expect(farmDay(MON_2030Z, 'SAR').weekday).toBe(2)
    expect(farmDay(MON_2030Z, 'AMERICA').weekday).toBe(1)
    expect(farmDay(MON_2030Z, 'EUROPE').weekday).toBe(1)
  })

  it('keeps Sunday until 04:00 Monday', () => {
    // America (UTC-5): Monday 03:59 is still Sunday; Asia is well into Monday.
    const at = Date.UTC(2026, 9, 5, 8, 59)
    expect(farmDay(at, 'AMERICA')).toEqual({ weekday: 0, msUntilReset: 60_000 })
    expect(farmDay(at, 'ASIA').weekday).toBe(1)
  })

  it('shows the domains of the server day', () => {
    const i = input()
    // Asia is on Tuesday: none of the needed families drop (Resistance isn't needed).
    expect(domainCards(i, farmDay(MON_2030Z, 'ASIA').weekday)).toEqual([])
    // America is still on Monday: Freedom and Decarabian.
    const america = domainCards(i, farmDay(MON_2030Z, 'AMERICA').weekday)
    expect(america.map((c) => c.detail)).toEqual(['Freedom', expect.stringContaining('Decarabian')])
  })
})

describe('today', () => {
  it('shows only the families open today, with who needs them', () => {
    const [rift, garden] = domainCards(input(), 1)
    expect(rift!.name).toBe(planner.domainOf.get('TeachingsOfFreedom')!.name)
    expect(linesOf(rift!)).toEqual(['TeachingsOfFreedom'])
    expect(rift!.goals).toEqual(['character:Amber'])
    expect(garden!.goals).toEqual(['weapon:FavoniusSword:Lisa'])

    const wednesday = domainCards(input(), 3)
    expect(wednesday.map((c) => c.detail)).toEqual(['Ballad'])
    expect(wednesday[0]!.goals).toEqual(['character:Lisa'])
  })

  it('opens every domain on Sunday', () => {
    const sunday = domainCards(input(), 0)
    const rift = sunday.find((c) => c.name === planner.domainOf.get('TeachingsOfFreedom')!.name)!
    expect(linesOf(rift)).toEqual(['TeachingsOfFreedom', 'TeachingsOfBallad'])
    expect(rift.goals).toEqual(['character:Amber', 'character:Lisa'])
    expect(sunday).toHaveLength(2)
  })

  it('groups the cards by the resin a run costs', () => {
    const sections = todaySections(input(), 1)
    expect(sections.map((s) => [s.key, s.resin])).toEqual([
      ['free', '0'],
      ['domain', '20'],
      ['boss', '40'],
      ['weekly', '30/60'],
    ])
    const [free, domain, boss, weekly] = sections
    expect(free!.cards.map((c) => c.kind)).toEqual(['local', 'common', 'elite', 'ore', 'other'])
    expect(free!.cards.every((c) => c.resinPerRun === 0 && c.run === null)).toBe(true)
    // Slime drops: one family, both characters.
    const common = free!.cards.find((c) => c.kind === 'common')!
    expect(linesOf(common)).toEqual(['SlimeCondensate'])
    expect(common.goals).toEqual(['character:Amber', 'character:Lisa'])
    expect(linesOf(free!.cards.find((c) => c.kind === 'other')!)).toEqual(['CrownOfInsight'])

    expect(domain!.cards.map((c) => c.kind)).toEqual(['domain', 'domain', 'ley', 'ley'])
    expect(domain!.cards.map((c) => c.resinPerRun)).toEqual([20, 20, 20, 20])
    expect(domain!.cards.slice(2).map((c) => c.name)).toEqual([
      'Blossom of Revelation',
      'Blossom of Wealth',
    ])

    expect(boss!.cards.map((c) => [c.kind, c.name, c.resinPerRun])).toEqual([
      ['boss', 'Hurricane Seed', 40],
      ['gem', 'Vayuda Turquoise', 40],
    ])
    expect(weekly!.cards.map((c) => c.name)).toEqual([
      planner.weeklyBossOf.get('DvalinsPlume')!.name,
    ])
    expect(weekly!.cards[0]!.run?.weekly).toBe(true)
  })

  it('lists only what is missing', () => {
    const totals = planTotals(planner, [amber], { TeachingsOfFreedom: 9, HurricaneSeed: 4 })
    const i = { ...input(), totals, plan: farmPlan(planner, totals, drops, { ar: 60, wl: 8 }) }
    const sections = todaySections(i, 1)
    expect(sections.find((s) => s.key === 'domain')!.cards.map((c) => c.kind)).toEqual([
      'ley',
      'ley',
    ])
    expect(sections.find((s) => s.key === 'boss')!.cards.map((c) => c.name)).toEqual([
      'Vayuda Turquoise',
    ])
  })

  it('counts a card’s days at the daily resin', () => {
    const plain = domainCards(input(), 1)[0]!.run!
    const refreshed = domainCards(input({ refreshes: 2 }), 1)[0]!.run!
    expect(refreshed.resin).toBe(plain.resin)
    expect(plain.days).toBe(Math.ceil(plain.resin / 180))
    expect(refreshed.days).toBe(Math.ceil(plain.resin / 300))
    expect(plain.condensed).toBe(Math.ceil(plain.resin / 60))
  })

  it('greys what the Adventure Rank can’t farm yet and says why', () => {
    const i = input({ ar: 10 })
    const domain = todaySections(i, 1).find((s) => s.key === 'domain')!
    // Locked domains after the ley lines.
    expect(domain.cards.map((c) => c.kind)).toEqual(['ley', 'ley', 'domain', 'domain'])
    const rift = domain.cards[2]!
    const entry = planner.domainOf.get('TeachingsOfFreedom')!
    expect(rift.status).toBe('locked')
    expect(rift.lock).toBe(`AR ${entry.tiers[0]!.ar}`)
    expect(rift.run).toBeNull()

    const boss = planner.weeklyBossOf.get('DvalinsPlume')!
    const weekly = todaySections(i, 1).find((s) => s.key === 'weekly')!.cards[0]!
    if (boss.tiers.length > 0 && boss.tiers[0]!.ar > 10) {
      expect(weekly.lock).toBe(`AR ${boss.tiers[0]!.ar}`)
    }
  })
})

describe('schedule', () => {
  it('lists the other day pairs, the next first', () => {
    const monday = scheduleDays(input(), 1)
    expect(monday.map((d) => d.days)).toEqual([
      [2, 5],
      [3, 6],
    ])
    expect(monday[0]!.cards).toEqual([])
    expect(monday[0]!.run).toBeNull()
    expect(monday[1]!.cards.map((c) => c.detail)).toEqual(['Ballad'])
    expect(monday[1]!.run?.resin).toBe(monday[1]!.cards[0]!.run?.resin)

    expect(scheduleDays(input(), 6).map((d) => d.days)).toEqual([
      [1, 4],
      [2, 5],
    ])
  })

  it('lists every pair on Sunday', () => {
    expect(scheduleDays(input(), 0).map((d) => d.days)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ])
  })
})

describe('headline', () => {
  it('is the resin of domains, bosses and ley lines over the daily resin', () => {
    const i = input()
    const plain = farmHeadline(i.plan, 0)
    expect(plain.resin).toBe(i.plan.total.resin)
    expect(plain.resin).toBeGreaterThan(0)
    expect(plain.days).toBe(Math.ceil(plain.resin / 180))
    const refreshed = farmHeadline(i.plan, 3)
    expect(refreshed.daily).toBe(360)
    expect(refreshed.days).toBe(Math.ceil(plain.resin / 360))
    expect(plain.weekly.weeks).toBe(i.plan.weeklyTotal.weeks)
    expect(plain.weekly.weeks).toBeGreaterThan(0)
  })
})

describe('who needs it', () => {
  it('is the goals of the missing lines', () => {
    const totals = planTotals(planner, [amber, lisa], { TeachingsOfFreedom: 0 })
    const line = (key: string) => totals.lines.get(key)!
    expect(goalsOf([line('TeachingsOfFreedom'), line('TeachingsOfBallad')])).toEqual([
      'character:Amber',
      'character:Lisa',
    ])
    const covered = planTotals(planner, [amber, lisa], { TeachingsOfBallad: 6 })
    expect(
      goalsOf([covered.lines.get('TeachingsOfFreedom')!, covered.lines.get('TeachingsOfBallad')!]),
    ).toEqual(['character:Amber'])
  })
})
