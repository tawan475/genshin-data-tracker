import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import {
  characterRequirement,
  createRequirementCache,
  emptyRequirement,
  type CharacterState,
  type PlanGoal,
} from '@gdt/game-data/planner-math'
import type { Good, PlannerTarget } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { allocateNeeds } from '../allocation'
import { buildBoard, type GoalEntry } from '../model'
import { farmsNoWeekly, partReadiness } from '../upgrade'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const T = (auto: number, skill: number, burst: number) => ({ auto, skill, burst })

const good: Good = {
  format: 'GOOD',
  version: 3,
  source: 'test',
  characters: [
    { key: 'Bennett', level: 80, constellation: 5, ascension: 5, talent: T(6, 6, 6) },
    { key: 'KaedeharaKazuha', level: 80, constellation: 0, ascension: 5, talent: T(1, 8, 8) },
    { key: 'Nahida', level: 60, constellation: 0, ascension: 3, talent: T(1, 4, 4) },
  ],
  weapons: [{ key: 'TheCatch', level: 1, ascension: 0, refinement: 5, location: '', lock: false }],
  artifacts: [],
  materials: {},
}
const character = (
  key: string,
  level: number,
  ascension: number,
  talents: CharacterState['talents'],
) =>
  ({
    kind: 'character',
    key,
    owner: '',
    target: { level, ascension, talents, active: true },
    updatedAt: 1,
  }) satisfies PlannerTarget
const targets: PlannerTarget[] = [
  character('Bennett', 80, 5, T(6, 8, 8)),
  character('KaedeharaKazuha', 90, 6, T(1, 8, 8)),
  character('Nahida', 90, 6, T(6, 9, 9)),
  {
    kind: 'weapon',
    id: 'catch01',
    key: 'TheCatch',
    owner: '',
    target: { level: 90, ascension: 6, refinement: 5, active: true },
    updatedAt: 1,
  },
]
const board = buildBoard(planner, good, {}, targets, createRequirementCache(planner))
const entry = (id: string): GoalEntry => board.entries.find((e) => e.id === id)!
const bennett = entry('character:Bennett')
const kazuha = entry('character:KaedeharaKazuha')
const nahida = entry('character:Nahida')
const theCatch = board.entries.find((e) => e.character === null)!

/** Every planner material in plenty. */
const rich = Object.fromEntries(
  [...planner.materialsByKey.keys()].map((key) => [key, key === planner.mora.key ? 1e9 : 9999]),
)
/** Exactly what a requirement lists (items and Mora), nothing more. */
function exactly(r: ReturnType<typeof characterRequirement>) {
  return { ...Object.fromEntries(r!.items), [planner.mora.key]: r!.mora }
}
const ready = (e: GoalEntry, bag: Record<string, number>, ar: number | null = null) =>
  Object.fromEntries(partReadiness(planner, e, bag, { ar }))

describe('what a goal can level now', () => {
  it('counts a part whose whole cost the bag covers', () => {
    expect(ready(bennett, rich)).toEqual({ 'character:Bennett|talents': 'full' })
    expect(ready(theCatch, rich)).toEqual({ [`${theCatch.id}|weapon`]: 'full' })
  })

  it('counts one talent level when the whole of them is out of reach', () => {
    const now = bennett.character!.current
    const oneUp = characterRequirement(
      planner,
      'Bennett',
      now,
      { ...now, talents: T(6, 7, 6) },
      { talentCaps: false },
    )
    expect(ready(bennett, exactly(oneUp))).toEqual({ 'character:Bennett|talents': 'step' })
    expect(ready(bennett, {})).toEqual({})
  })

  it('counts the next level band or ascension, and the Adventure Rank it needs', () => {
    const now = kazuha.character!.current
    const ascend = characterRequirement(planner, 'KaedeharaKazuha', now, {
      ...now,
      level: 80,
      ascension: 6,
    })
    const level = 'character:KaedeharaKazuha|level'
    expect(ready(kazuha, exactly(ascend))).toEqual({ [level]: 'step' })
    expect(ready(kazuha, rich)).toEqual({ [level]: 'full' })
    // An ascension the account's Adventure Rank doesn't allow yet can't be done.
    const ar = planner.characters.get('KaedeharaKazuha')!.ascension[6]!.ar
    expect(ar).toBeGreaterThan(0)
    expect(ready(kazuha, rich, ar - 1)).toEqual({})
    expect(ready(kazuha, rich, ar)).toEqual({ [level]: 'full' })
  })

  it("doesn't count talents past what the ascension reached allows as the whole part", () => {
    // Ascension 3 caps talents at 4: 6/9/9 needs the ascensions first.
    expect(ready(nahida, rich)).toEqual({
      'character:Nahida|level': 'full',
      'character:Nahida|talents': 'step',
    })
  })

  it('counts a weapon’s first level band', () => {
    const w = theCatch.weapons[0]!
    const exp = planner.weaponExp[w.rarity! - 1]!.slice(0, 19).reduce((a, b) => a + b, 0)
    const ores = Math.ceil(exp / 10_000)
    const bag = { MysticEnhancementOre: ores, [planner.mora.key]: 1e6 }
    expect(ready(theCatch, bag)).toEqual({ [`${theCatch.id}|weapon`]: 'step' })
  })

  it('has nothing for a card with nothing left to level', () => {
    expect(ready({ ...bennett, materialsDone: true }, rich)).toEqual({})
  })
})

describe('still to farm, but no weekly boss', () => {
  const plume = planner.weeklyBossOf.get('DvalinsPlume')!
  const goal = (id: string, items: Record<string, number>): PlanGoal => ({
    id,
    requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)) },
  })
  // Two Plumes and five Philosophies: the books are always to farm.
  const mine = goal('character:Bennett', { DvalinsPlume: 2, PhilosophiesOfResistance: 5 })
  const counted = { active: true, materialsDone: false }
  /** Bennett's readiness after the goals listed before it. */
  const needsOf = (bag: Record<string, number>, above: PlanGoal[] = [], self = mine) =>
    allocateNeeds(
      planner,
      [...above, self].map((g) => ({ id: g.id, goal: g, active: true })),
      bag,
      {},
    ).get(self.id)
  const qualifies = (bag: Record<string, number>, above: PlanGoal[] = [], self = mine) =>
    farmsNoWeekly(counted, needsOf(bag, above, self))

  it('counts weekly drops that are held', () => {
    expect(qualifies({ DvalinsPlume: 2 })).toBe(true)
  })

  it('counts weekly drops Dream Solvent converts from the same boss', () => {
    const other = plume.items.find((m) => m.key !== 'DvalinsPlume')!.key
    const solvent = { [planner.items.dreamSolvent]: 2 * plume.solvent }
    expect(qualifies({ [other]: 2, ...solvent })).toBe(true)
    // Without the solvent they are still a weekly boss to fight.
    expect(qualifies({ [other]: 2 })).toBe(false)
  })

  it('leaves the drops a goal above takes first to it', () => {
    const above = goal('character:Venti', { DvalinsPlume: 2 })
    expect(qualifies({ DvalinsPlume: 2 }, [above])).toBe(false)
    expect(qualifies({ DvalinsPlume: 4 }, [above])).toBe(true)
  })

  it('wants something left to farm, and none of it weekly', () => {
    const all = { DvalinsPlume: 2, PhilosophiesOfResistance: 5 }
    expect(needsOf(all)?.chips).toEqual([])
    expect(qualifies(all)).toBe(false)
    // Short of the Plumes only (the books held): a weekly boss to fight.
    expect(qualifies({ PhilosophiesOfResistance: 5 })).toBe(false)
    // Levels only, nothing weekly at all, and short: in.
    expect(qualifies({}, [], goal('character:Kazuha', { SeaGanoderma: 10 }))).toBe(true)
  })

  it('only for counted goals with something left to level', () => {
    const needs = needsOf({ DvalinsPlume: 2 })
    expect(farmsNoWeekly({ active: false, materialsDone: false }, needs)).toBe(false)
    expect(farmsNoWeekly({ active: true, materialsDone: true }, needs)).toBe(false)
    expect(farmsNoWeekly(counted, null)).toBe(false)
    expect(planner.materialsByKey.get('DvalinsPlume')?.kind).toBe('weekly')
  })
})
