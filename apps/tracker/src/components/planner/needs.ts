/**
 * What a goal still needs, for its card, pure. Seelie's three states, per
 * material and for the goal as a whole:
 * - `all`: the bag covers it with the other goals counted first (green,
 *   ready). On the Planner those are the goals above it in priority order
 *   (allocation.ts): materials go to higher goals first;
 * - `alone`: it covers this goal on its own, not after the others (yellow);
 * - `short`: not even this goal on its own (red).
 * Crafting, conversions and the EXP items are counted as in the totals. Each
 * material that isn't `all` becomes a chip: how many are short, of this goal
 * alone (red) or, for a yellow one, after the others.
 */

import type { PlannerData, PlannerMaterial } from '@gdt/game-data'
import type { StockStatus } from '@gdt/game-data/planner-goals'
import {
  planTotals,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
} from '@gdt/game-data/planner-math'

type Bag = Readonly<Record<string, number>>

export interface NeedChip {
  /** GOOD key (the largest EXP book / ore for EXP). */
  key: string
  material: PlannerMaterial
  /** Short by this many (EXP in the largest item, rounded up). */
  count: number
  status: Exclude<StockStatus, 'all'>
  /** `exp` / `ore` when the chip stands for EXP points. */
  exp?: 'character' | 'weapon'
}

export interface GoalNeeds {
  status: StockStatus
  /** Red first, then yellow; within each, the order of the material kinds. */
  chips: NeedChip[]
}

const KIND_ORDER = [
  'mora',
  'exp',
  'ore',
  'gem',
  'boss',
  'local',
  'common',
  'book',
  'weekly',
  'crown',
  'weapon',
  'elite',
  'currency',
]

/**
 * `all` is the totals of every counted goal (the page has them); pass
 * `others` instead for a goal that isn't counted, so it is costed with them.
 */
export function goalNeeds(
  planner: PlannerData,
  goal: PlanGoal,
  bag: Bag,
  options: PlanOptions,
  all: PlanTotals | { others: readonly PlanGoal[] },
): GoalNeeds {
  const self = { ...goal, active: true }
  const alone = planTotals(planner, [self], bag, options)
  const together =
    'others' in all
      ? planTotals(planner, [...all.others.filter((g) => g.id !== goal.id), self], bag, options)
      : all
  return needsBetween(planner, goal, alone, null, together)
}

/**
 * The chips and readiness of `goal` from three totals: the goal `alone`, the
 * goals counted `before` it (null: none) and `after` it joins them. What it
 * is short of after the others is what it adds to their shortfall, so with
 * `before` = the goals above it, `all` means ready after them (see
 * allocation.ts); with `before` null and `after` every goal, ready with all.
 */
export function needsBetween(
  planner: PlannerData,
  goal: PlanGoal,
  alone: PlanTotals,
  before: PlanTotals | null,
  after: PlanTotals,
): GoalNeeds {
  const chips: NeedChip[] = []
  let worst: StockStatus = 'all'
  const note = (status: StockStatus) => {
    if (status === 'short' || (status === 'alone' && worst === 'all')) worst = status
  }
  /** Status and chip count from the goal's missing alone and what it adds with the others. */
  const judge = (aloneMissing: number, added: number) => {
    const status: StockStatus = aloneMissing > 0 ? 'short' : added > 0 ? 'alone' : 'all'
    note(status)
    return { status, count: status === 'short' ? aloneMissing : added }
  }
  const added = (now: number, then: number | undefined) => Math.max(0, now - (then ?? 0))

  for (const key of goal.requirement.items.keys()) {
    const { status, count } = judge(
      alone.lines.get(key)?.missing ?? 0,
      added(after.lines.get(key)?.missing ?? 0, before?.lines.get(key)?.missing),
    )
    const material = planner.materialsByKey.get(key)
    if (status !== 'all' && material) chips.push({ key, material, status, count })
  }
  for (const kind of ['character', 'weapon'] as const) {
    const need = kind === 'character' ? goal.requirement.characterExp : goal.requirement.weaponExp
    if (need <= 0) continue
    const field = kind === 'character' ? 'characterExp' : 'weaponExp'
    const { status, count } = judge(
      alone[field].missing,
      added(after[field].missing, before?.[field].missing),
    )
    const big = planner.expItems[kind].at(-1)
    if (status !== 'all' && big) {
      chips.push({
        key: big.material.key,
        material: big.material,
        status,
        count: Math.ceil(count / big.exp),
        exp: kind,
      })
    }
  }
  if (goal.requirement.mora > 0) {
    const { status, count } = judge(
      alone.mora.missing,
      added(after.mora.missing, before?.mora.missing),
    )
    if (status !== 'all') {
      chips.push({ key: planner.mora.key, material: planner.mora, status, count })
    }
  }

  const rank = (c: NeedChip) => KIND_ORDER.indexOf(c.material.kind)
  chips.sort(
    (a, b) =>
      Number(b.status === 'short') - Number(a.status === 'short') ||
      rank(a) - rank(b) ||
      (a.material.family?.key ?? a.key).localeCompare(b.material.family?.key ?? b.key) ||
      a.material.tier - b.material.tier,
  )
  return { status: worst, chips }
}
