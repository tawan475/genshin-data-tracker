import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { craftingSteps } from '@gdt/game-data/planner-convert'
import { farmPlan } from '@gdt/game-data/planner-estimate'
import {
  emptyRequirement,
  planTotals,
  type PlanGoal,
  type PlanTotals,
} from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import { allocateNeeds, createAllocationMemo, type AllocationItem } from '../allocation'
import { allocatedShares, allocatedTotals } from '../allocated-totals'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const options = { forge: true }

const goal = (id: string, items: Record<string, number>, extra = {}): PlanGoal => ({
  id,
  requirement: { ...emptyRequirement(), items: new Map(Object.entries(items)), ...extra },
})
/** Allocates `goals` (highest first; `paused` ids not counted) and returns the memo. */
function allocate(goals: PlanGoal[], bag: Record<string, number>, paused: string[] = []) {
  const memo = createAllocationMemo()
  const items: AllocationItem[] = goals.map((g) => ({
    id: g.id,
    goal: g,
    active: !paused.includes(g.id),
  }))
  allocateNeeds(planner, items, bag, options, memo)
  return memo
}
const missing = (t: PlanTotals) =>
  Object.fromEntries(
    [...t.lines]
      .filter(([, l]) => l.missing > 0)
      .map(([k, l]) => [k, l.missing])
      .sort(),
  )
const stepsOf = (t: PlanTotals) =>
  craftingSteps(planner, t)
    .map((s) => `${s.kind}:${s.kind === 'forge' ? s.input : s.from.key}>${s.to.key}:${s.count}`)
    .sort()

// Hu Tao above Xiangling: both want Philosophies of Diligence (4 held, Guides to craft one
// more), Xiangling also EXP, Mora and Slime; Bennett (paused) wants Philosophies too.
const huTao = goal('character:HuTao', { PhilosophiesOfDiligence: 3, JuvenileJade: 2 })
const xiangling = goal(
  'character:Xiangling',
  { PhilosophiesOfDiligence: 3, SlimeConcentrate: 4 },
  { characterExp: 100_000, mora: 50_000, weaponExp: 25_000 },
)
const bennett = goal('character:Bennett', { PhilosophiesOfDiligence: 9 })
const bag = {
  PhilosophiesOfDiligence: 4,
  GuideToDiligence: 3,
  SlimeCondensate: 9,
  HerosWit: 2,
  CrystalChunk: 8,
  Mora: 60_000,
}
const goals = [huTao, bennett, xiangling]
const memo = allocate(goals, bag, ['character:Bennett'])

describe('the totals of some goals, after the goals above', () => {
  it('is every counted goal’s totals when all are kept', () => {
    const all = allocatedTotals(planner, memo, new Set(goals.map((g) => g.id)))
    const direct = planTotals(planner, [huTao, xiangling], bag, options)
    expect(missing(all)).toEqual(missing(direct))
    expect(all.characterExp.missing).toBe(direct.characterExp.missing)
    expect(all.weaponExp.missing).toBe(direct.weaponExp.missing)
    expect(all.mora.missing).toBe(direct.mora.missing)
    expect(all.mora.need).toBe(direct.mora.need)
    expect(stepsOf(all)).toEqual(stepsOf(direct))
    expect(stepsOf(all).length).toBeGreaterThan(0)
  })

  it('leaves a kept goal what the goals above leave it, the ones left out too', () => {
    // 4 + 1 crafted = 5 Philosophies: Hu Tao takes 3 first, Xiangling is 1 short.
    const mine = allocatedTotals(planner, memo, new Set([xiangling.id]))
    expect(mine.lines.get('PhilosophiesOfDiligence')).toMatchObject({ need: 3, missing: 1 })
    // Hu Tao's Jade isn't Xiangling's to farm, and nothing else of hers is short of books.
    expect(mine.lines.get('JuvenileJade')?.missing ?? 0).toBe(0)
    expect(mine.lines.get('JuvenileJade')?.need ?? 0).toBe(0)
    const hers = allocatedTotals(planner, memo, new Set([huTao.id]))
    expect(hers.lines.get('PhilosophiesOfDiligence')).toMatchObject({ need: 3, missing: 0 })
    expect(hers.lines.get('JuvenileJade')).toMatchObject({ need: 2, missing: 2 })
    // The two shares add up to the whole.
    const all = planTotals(planner, [huTao, xiangling], bag, options)
    for (const [key, line] of all.lines) {
      const sum = (mine.lines.get(key)?.missing ?? 0) + (hers.lines.get(key)?.missing ?? 0)
      expect([key, sum]).toEqual([key, line.missing])
    }
  })

  it('names only the kept goals as needing something', () => {
    const mine = allocatedTotals(planner, memo, new Set([xiangling.id]))
    expect(mine.lines.get('PhilosophiesOfDiligence')!.goals).toEqual([xiangling.id])
    expect(mine.characterExp.goals).toEqual([xiangling.id])
    expect(mine.mora.goals).toEqual([xiangling.id])
    const farm = farmPlan(planner, mine, null)
    expect(farm.groups.flatMap((g) => g.goals)).not.toContain(huTao.id)
  })

  it('crafts, forges and levels for the kept goals only', () => {
    // Hu Tao comes first and uses 3 of the 4 held: the Guides are crafted for Xiangling.
    const mine = allocatedTotals(planner, memo, new Set([xiangling.id]))
    expect(stepsOf(mine)).toContain('craft:GuideToDiligence>PhilosophiesOfDiligence:1')
    expect(stepsOf(mine).some((s) => s.startsWith('forge:CrystalChunk>'))).toBe(true)
    expect(mine.characterExp.missingItems.length).toBeGreaterThan(0)
    const hers = allocatedTotals(planner, memo, new Set([huTao.id]))
    expect(stepsOf(hers)).toEqual([])
    expect(hers.characterExp.missing).toBe(0)
    expect(hers.forge).toBeNull()
  })

  it('gives paused goals no share, and is empty for none', () => {
    expect(allocatedShares(memo, new Set([bennett.id]))).toEqual([])
    const none = allocatedTotals(planner, memo, new Set())
    expect(none.lines.size).toBe(0)
    expect(none.mora.missing).toBe(0)
    expect(stepsOf(none)).toEqual([])
    // Shares come in priority order, each after the one above.
    const shares = allocatedShares(memo, new Set([huTao.id, xiangling.id]))
    expect(shares.map((s) => s.id)).toEqual([huTao.id, xiangling.id])
    expect(shares[0]!.before).toBeNull()
    expect(shares[1]!.before).toBe(shares[0]!.after)
  })

  it('carries Dream Solvent conversions with the goal that needs them', () => {
    const boss = planner.weeklyBossOf.get('DvalinsPlume')!
    const other = boss.items.find((m) => m.key !== 'DvalinsPlume')!.key
    const a = goal('character:Venti', { SeaGanoderma: 1 })
    const b = goal('character:Bennett', { DvalinsPlume: 2 })
    const m = allocate([a, b], { [other]: 2, [planner.items.dreamSolvent]: 9 })
    const mine = allocatedTotals(planner, m, new Set([b.id]))
    expect(stepsOf(mine)).toEqual([`convert:${other}>DvalinsPlume:2`])
    expect(mine.lines.get('DvalinsPlume')!.missing).toBe(0)
    expect(stepsOf(allocatedTotals(planner, m, new Set([a.id])))).toEqual([])
  })
})
