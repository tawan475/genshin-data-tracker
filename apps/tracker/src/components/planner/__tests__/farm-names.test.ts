import { decodePlanner } from '@gdt/game-data'
import dropsJson from '@gdt/game-data/data/drops.json'
import farmingJson from '@gdt/game-data/data/farming.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import { parseDropRates } from '@gdt/game-data/drops'
import { decodeFarming, type FarmingData } from '@gdt/game-data/farming'
import type { FarmingFile, PlannerFile } from '@gdt/game-data/format'
import { farmPlan } from '@gdt/game-data/planner-estimate'
import { emptyRequirement, planTotals, type PlanGoal } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import type { ArtifactDomain } from '../artifact-domains'
import {
  ELSEWHERE,
  artifactCards,
  bossCards,
  farmHeadline,
  freeCards,
  todaySections,
  type ArtifactWant,
  type FarmInput,
} from '../farm-today'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const { rates: drops } = parseDropRates(dropsJson)
const farming = decodeFarming(farmingJson as unknown as FarmingFile)

const goal = (id: string, items: Record<string, number>): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)) },
})

function input(
  goals: PlanGoal[],
  options: { wl?: number; ar?: number; farming?: FarmingData | null } = {},
): FarmInput {
  const totals = planTotals(planner, goals, {})
  const ar = options.ar ?? 60
  const wl = options.wl ?? 8
  return {
    planner,
    plan: farmPlan(planner, totals, drops, { ar, wl }),
    totals,
    drops,
    ar,
    wl,
    refreshes: 0,
    farming: options.farming === undefined ? farming : options.farming,
  }
}

const keys = (card: { lines: { material: { key: string } }[] }) =>
  card.lines.map((l) => l.material.key)

describe('boss cards', () => {
  it('are named after the boss, with the gems a single-element boss drops on the same card', () => {
    const cards = bossCards(
      input([goal('character:Venti', { HurricaneSeed: 46, VayudaTurquoiseSliver: 1 })]),
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]!.name).toBe('Anemo Hypostasis')
    expect(cards[0]!.kind).toBe('boss')
    expect(keys(cards[0]!)).toEqual(['HurricaneSeed', 'VayudaTurquoiseSliver'])
    // One run drops both: the card takes the longer of the two estimates.
    const plan = input([
      goal('character:Venti', { HurricaneSeed: 46, VayudaTurquoiseSliver: 1 }),
    ]).plan
    const runs = plan.groups.filter((g) => g.run).map((g) => g.run!.runs)
    expect(cards[0]!.run!.runs).toBe(Math.max(...runs))
  })

  it('gives other gems their own card named after their bosses, single-element first', () => {
    const cards = bossCards(
      input([goal('character:HuTao', { JuvenileJade: 46, AgnidusAgateSliver: 1 })]),
    )
    expect(cards.map((c) => c.kind)).toEqual(['boss', 'gem'])
    expect(cards[0]!.name).toBe('Primo Geovishap')
    expect(keys(cards[0]!)).toEqual(['JuvenileJade'])
    const gem = cards[1]!
    expect(keys(gem)).toEqual(['AgnidusAgateSliver'])
    const bosses = farming.gemBossesOf.get('AgnidusAgateSliver')!
    expect(bosses[0]!.gems).toHaveLength(1)
    expect(gem.name).toBe(bosses[0]!.name)
    expect(gem.detail.split(' · ')).toEqual(bosses.slice(1).map((b) => b.name))
  })

  it('names a boss dropping two materials once', () => {
    const cards = bossCards(
      input([
        goal('character:A', {
          ArtificedSpareClockworkComponentCoppelia: 2,
          ArtificedSpareClockworkComponentCoppelius: 2,
        }),
      ]),
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]!.name).toBe('"Icewind Suite"')
  })

  it('falls back to the drop names without farming data', () => {
    const cards = bossCards(
      input([goal('character:Venti', { HurricaneSeed: 46, VayudaTurquoiseSliver: 1 })], {
        farming: null,
      }),
    )
    expect(cards.map((c) => [c.kind, c.name])).toEqual([
      ['boss', 'Hurricane Seed'],
      ['gem', 'Vayuda Turquoise'],
    ])
  })

  it('says "at most" at World Level 9, where the drop is a guaranteed minimum', () => {
    expect(drops.bosses.byWorldLevel.get(9)?.bossMinimum).toBe(true)
    const wl9 = input([goal('character:Venti', { HurricaneSeed: 46 })], { wl: 9 })
    const card = bossCards(wl9)[0]!
    expect(card.run?.upperBound).toBe(true)
    expect(farmHeadline(wl9.plan, 0).upperBound).toBe(true)
    const wl8 = input([goal('character:Venti', { HurricaneSeed: 46 })], { wl: 8 })
    expect(bossCards(wl8)[0]!.run?.upperBound).toBe(false)
    expect(farmHeadline(wl8.plan, 0).upperBound).toBe(false)
  })

  it('never greys a boss for its handbook Adventure Rank', () => {
    const card = bossCards(input([goal('character:Venti', { HurricaneSeed: 46 })], { ar: 5 }))[0]!
    expect(card.lock).toBeNull()
  })
})

describe('enemy and local cards', () => {
  it('names enemy drops after the enemies, one card per enemy', () => {
    const free = freeCards(
      input([
        goal('character:A', {
          SlimeCondensate: 18,
          DamagedMask: 18,
          FirmArrowhead: 18,
          DeadLeyLineBranch: 18,
        }),
      ]),
    )
    const common = free.filter((c) => c.kind === 'common')
    expect(common.map((c) => [c.name, keys(c)])).toEqual([
      ['Hilichurl', ['DamagedMask']],
      ['Hilichurl Shooter', ['FirmArrowhead']],
      ['Slime', ['SlimeCondensate']],
    ])
    expect(common[0]!.detail).toBe(
      'Hilichurl Shooter · Samachurl · Mitachurl · Hilichurl Chieftain',
    )
    const elite = free.filter((c) => c.kind === 'elite')
    expect(elite.map((c) => [c.name, keys(c)])).toEqual([['Abyss Mage', ['DeadLeyLineBranch']]])
  })

  it('groups local specialties by region, in the game’s order, with their areas', () => {
    const free = freeCards(
      input([goal('character:A', { JueyunChili: 10, Wolfhook: 10, Valberry: 10 })]),
    )
    const local = free.filter((c) => c.kind === 'local')
    expect(local.map((c) => [c.name, keys(c)])).toEqual([
      ['Mondstadt', ['Valberry', 'Wolfhook']],
      ['Liyue', ['JueyunChili']],
    ])
    expect(local[0]!.detail).toBe('Stormbearer Mountains · Wolvendom')
    expect(local[0]!.goals).toEqual(['character:A'])
  })

  it('keeps one list per kind without farming data', () => {
    const free = freeCards(
      input([goal('character:A', { JueyunChili: 10, Wolfhook: 10, SlimeCondensate: 3 })], {
        farming: null,
      }),
    )
    expect(free.map((c) => [c.kind, c.name])).toEqual([
      ['local', 'Local specialties'],
      ['common', 'Common enemies'],
    ])
  })
})

describe('artifact cards', () => {
  const domain = (id: number, name: string, sets: string[], ar = 30): ArtifactDomain => ({
    id,
    name,
    region: null,
    ar,
    resin: 20,
    sets,
    // The domain's own two sets are 5★, the shared one after them 4★.
    rarities: sets.map((_, i) => (i < 2 ? 5 : 4)),
  })
  const midsummer = domain(
    1,
    'Midsummer Courtyard',
    ['Thundersoother', 'ThunderingFury', 'Gambler'],
    20,
  )
  const momiji = domain(16, 'Momiji-Dyed Court', [
    'ShimenawasReminiscence',
    'EmblemOfSeveredFate',
    'Gambler',
  ])
  const domains = [midsummer, momiji]
  const of = new Map<string, ArtifactDomain[]>()
  for (const d of domains) for (const s of d.sets) of.set(s, [...(of.get(s) ?? []), d])
  const withDomains = { ...farming, artifactDomains: domains, artifactDomainsOf: of } as FarmingData

  const wants: ArtifactWant[] = [
    { goal: 'character:Raiden', sets: ['EmblemOfSeveredFate'] },
    { goal: 'character:Fischl', sets: ['ThunderingFury', 'GladiatorsFinale'] },
    { goal: 'character:Bennett', sets: ['Gambler', 'EmblemOfSeveredFate'] },
  ]
  const cardsFor = (ar = 60) =>
    artifactCards({ ...input([], { farming: withDomains, ar }), artifacts: wants })

  it('lists the domains of the sets wanted, with who wants them', () => {
    const cards = cardsFor()
    expect(cards.map((c) => [c.name, c.sets, c.goals])).toEqual([
      [
        'Momiji-Dyed Court',
        ['EmblemOfSeveredFate', 'Gambler'],
        ['character:Raiden', 'character:Bennett'],
      ],
      ['Midsummer Courtyard', ['ThunderingFury'], ['character:Fischl']],
      [ELSEWHERE, ['GladiatorsFinale'], ['character:Fischl']],
    ])
    const [court] = cards
    expect(court!.detail).toBe('Emblem of Severed Fate · Gambler')
    expect(court!.resinPerRun).toBe(20)
    // No run estimate: artifacts are luck.
    expect(cards.every((c) => c.run === null && c.kind === 'artifact')).toBe(true)
  })

  it('greys a domain the Adventure Rank can’t enter yet, last', () => {
    const cards = cardsFor(25)
    expect(cards.map((c) => [c.name, c.lock])).toEqual([
      ['Midsummer Courtyard', null],
      [ELSEWHERE, null],
      ['Momiji-Dyed Court', 'AR 30'],
    ])
  })

  it('is a section of its own after the weekly bosses', () => {
    const sections = todaySections({ ...input([], { farming: withDomains }), artifacts: wants }, 1)
    expect(sections.map((s) => [s.key, s.resin])).toEqual([['artifact', '20']])
  })

  it('reads every set as "elsewhere" without artifact domains in the game data', () => {
    const cards = artifactCards({ ...input([], { farming: null }), artifacts: wants })
    expect(cards.map((c) => c.name)).toEqual([ELSEWHERE])
    expect(cards[0]!.sets).toEqual([
      'EmblemOfSeveredFate',
      'ThunderingFury',
      'GladiatorsFinale',
      'Gambler',
    ])
  })
})
