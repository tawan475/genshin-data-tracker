import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import {
  characterRequirement,
  createRequirementCache,
  type CharacterState,
} from '@gdt/game-data/planner-math'
import type { Good, PlannerTarget } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { buildBoard, type GoalEntry } from '../model'
import { needsWeekly, partReadiness } from '../upgrade'

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

describe('weekly boss materials', () => {
  it('tells a cost that needs one from one that does not', () => {
    // Bennett's talents 7 and 8 take Dvalin's Plume; Kazuha's levels none.
    expect(needsWeekly(planner, bennett.character!.requirement)).toBe(true)
    expect(needsWeekly(planner, kazuha.character!.requirement)).toBe(false)
    expect(needsWeekly(planner, theCatch.weapons[0]!.requirement)).toBe(false)
    expect(needsWeekly(planner, null)).toBe(false)
    expect(planner.materialsByKey.get('DvalinsPlume')?.kind).toBe('weekly')
  })
})
