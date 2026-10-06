/**
 * Priority that allocates, pure: the bag goes to goals in priority order,
 * higher first, so a goal is ready when the bag covers it after every
 * counted goal above it (Seelie only sorts). The farm totals don't change:
 * they are everything together.
 *
 * - `allocateNeeds`: each goal's readiness and missing chips (needs.ts) in
 *   that order. A goal that isn't counted is costed where it stands, after
 *   the counted goals above it, and takes nothing from the ones below. The
 *   goals above are summed as they go (one running requirement), so each
 *   goal costs at most two `planTotals` of two goals: linear in the goals,
 *   not quadratic. With a memo (`createAllocationMemo`) a goal's own totals
 *   are kept while its cost and the bag are the same, and the goals above
 *   the first one that changed (paused, moved, edited) are not redone.
 * - `moveTo` / `reprioritize`: a drag (or a keyboard move) as a new order,
 *   and the priorities that store it (1, 2, 3… for the cards in order).
 */

import type { PlannerData } from '@gdt/game-data'
import {
  emptyRequirement,
  planTotals,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
  type Requirement,
} from '@gdt/game-data/planner-math'
import { needsBetween, type GoalNeeds } from './needs'

type Bag = Readonly<Record<string, number>>

export interface AllocationItem {
  id: string
  /** The card's cost as one goal; null when there is nothing left to do. */
  goal: PlanGoal | null
  /** Counted in the totals (a paused goal takes nothing from the ones below). */
  active: boolean
}

/** `sum` plus `r` (items, Mora, EXP: what `planTotals` adds up without the Mora passives). */
function addInto(sum: Requirement, r: Requirement): void {
  for (const [key, count] of r.items) sum.items.set(key, (sum.items.get(key) ?? 0) + count)
  sum.mora += r.mora
  sum.characterExp += r.characterExp
  sum.weaponExp += r.weaponExp
}

interface Step {
  id: string
  goal: PlanGoal | null
  active: boolean
  needs: GoalNeeds | null
  /** The running state after this goal: the counted goals so far as one, and their totals. */
  above: Requirement
  counted: number
  before: PlanTotals | null
}

/** What `allocateNeeds` keeps between calls (one per page). */
export interface AllocationMemo {
  planner: PlannerData | null
  bag: Bag | null
  options: string
  /** A goal's totals on its own, by its cost object. */
  alone: WeakMap<PlanGoal, PlanTotals>
  steps: Step[]
}

export function createAllocationMemo(): AllocationMemo {
  return { planner: null, bag: null, options: '', alone: new WeakMap(), steps: [] }
}

function copyRequirement(r: Requirement): Requirement {
  return {
    ...emptyRequirement(),
    items: new Map(r.items),
    mora: r.mora,
    characterExp: r.characterExp,
    weaponExp: r.weaponExp,
  }
}

/**
 * Readiness and chips per id, `items` in priority order (highest first).
 * `options` must leave the Mora passives out (`passives: null`): the goals
 * above are summed into one requirement, which has no weapon type. `memo`
 * (optional) carries the work over to the next call: pass the same one for
 * the same page.
 */
export function allocateNeeds(
  planner: PlannerData,
  items: readonly AllocationItem[],
  bag: Bag,
  options: PlanOptions,
  memo: AllocationMemo = createAllocationMemo(),
): Map<string, GoalNeeds> {
  const optionsKey = JSON.stringify([
    options.azoth ?? null,
    options.forge ?? null,
    !!options.passives,
  ])
  if (memo.planner !== planner || memo.bag !== bag || memo.options !== optionsKey) {
    Object.assign(memo, { planner, bag, options: optionsKey, alone: new WeakMap(), steps: [] })
  }
  // The goals before the first change are as they were.
  let start = 0
  const old = memo.steps
  while (
    start < items.length &&
    start < old.length &&
    items[start]!.id === old[start]!.id &&
    items[start]!.goal === old[start]!.goal &&
    items[start]!.active === old[start]!.active
  ) {
    start++
  }
  const steps = old.slice(0, start)
  const last = steps[start - 1]
  /** The counted goals above, as one. */
  const above: PlanGoal = {
    id: 'above',
    requirement: last ? copyRequirement(last.above) : emptyRequirement(),
    active: true,
  }
  let counted = last?.counted ?? 0
  let before: PlanTotals | null = last?.before ?? null
  for (const item of items.slice(start)) {
    let needs: GoalNeeds | null = null
    if (item.goal) {
      const self = { ...item.goal, active: true }
      let alone = memo.alone.get(item.goal)
      if (!alone) {
        alone = planTotals(planner, [self], bag, options)
        memo.alone.set(item.goal, alone)
      }
      const after = counted ? planTotals(planner, [above, self], bag, options) : alone
      needs = needsBetween(planner, item.goal, alone, before, after)
      if (item.active) {
        addInto(above.requirement, self.requirement)
        counted++
        before = after
      }
    }
    steps.push({
      id: item.id,
      goal: item.goal,
      active: item.active,
      needs,
      above: copyRequirement(above.requirement),
      counted,
      before,
    })
  }
  memo.steps = steps
  const result = new Map<string, GoalNeeds>()
  for (const step of steps) if (step.needs) result.set(step.id, step.needs)
  return result
}

/** `order` with `id` moved to where `to` is (before it moving up, after it moving down). */
export function moveTo(order: readonly string[], id: string, to: string): string[] {
  const from = order.indexOf(id)
  const at = order.indexOf(to)
  if (from < 0 || at < 0 || from === at) return [...order]
  const next = order.filter((x) => x !== id)
  next.splice(at, 0, id)
  return next
}

/** `order` with `id` moved by `delta` places (clamped), for the keyboard. */
export function moveBy(order: readonly string[], id: string, delta: number): string[] {
  const from = order.indexOf(id)
  if (from < 0) return [...order]
  const at = Math.max(0, Math.min(order.length - 1, from + delta))
  return moveTo(order, id, order[at]!)
}

/**
 * The priorities that store `order` (1 for the first): only those that
 * change, by id. `current` is each id's stored priority (null: unset).
 */
export function reprioritize(
  order: readonly string[],
  current: ReadonlyMap<string, number | null>,
): Map<string, number> {
  const changes = new Map<string, number>()
  order.forEach((id, index) => {
    if (current.get(id) !== index + 1) changes.set(id, index + 1)
  })
  return changes
}
