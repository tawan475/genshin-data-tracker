/**
 * What a goal still needs, for its card, pure. Seelie's three states, per
 * material and for the goal as a whole:
 * - `all`: the bag covers it with every counted goal (green, ready);
 * - `alone`: it covers this goal on its own, not with the others (yellow);
 * - `short`: not even this goal on its own (red).
 * Crafting, conversions and the EXP items are counted as in the totals. Each
 * material that isn't `all` becomes a chip: how many are short, of this goal
 * alone (red) or, for a yellow one, of all goals together.
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

const state = (allMissing: number, aloneMissing: number): StockStatus =>
  allMissing === 0 ? 'all' : aloneMissing === 0 ? 'alone' : 'short'

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
  const chips: NeedChip[] = []
  let worst: StockStatus = 'all'
  const note = (status: StockStatus) => {
    if (status === 'short' || (status === 'alone' && worst === 'all')) worst = status
  }

  for (const key of goal.requirement.items.keys()) {
    const aloneMissing = alone.lines.get(key)?.missing ?? 0
    const allMissing = together.lines.get(key)?.missing ?? 0
    const status = state(allMissing, aloneMissing)
    note(status)
    const material = planner.materialsByKey.get(key)
    if (status !== 'all' && material) {
      chips.push({ key, material, status, count: status === 'short' ? aloneMissing : allMissing })
    }
  }
  for (const kind of ['character', 'weapon'] as const) {
    const need = kind === 'character' ? goal.requirement.characterExp : goal.requirement.weaponExp
    if (need <= 0) continue
    const field = kind === 'character' ? 'characterExp' : 'weaponExp'
    const status = state(together[field].missing, alone[field].missing)
    note(status)
    const big = planner.expItems[kind].at(-1)
    if (status !== 'all' && big) {
      const missing = status === 'short' ? alone[field].missing : together[field].missing
      chips.push({
        key: big.material.key,
        material: big.material,
        status,
        count: Math.ceil(missing / big.exp),
        exp: kind,
      })
    }
  }
  if (goal.requirement.mora > 0) {
    const status = state(together.mora.missing, alone.mora.missing)
    note(status)
    if (status !== 'all') {
      chips.push({
        key: planner.mora.key,
        material: planner.mora,
        status,
        count: status === 'short' ? alone.mora.missing : together.mora.missing,
      })
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
