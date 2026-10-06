/**
 * Priority that allocates, pure: the bag goes to goals in priority order,
 * higher first, so a goal is ready when the bag covers it after every
 * counted goal above it (Seelie only sorts). The farm totals don't change:
 * they are everything together.
 *
 * - `allocateNeeds`: each goal's readiness and missing chips (needs.ts) in
 *   that order. A goal that isn't counted is costed where it stands, after
 *   the counted goals above it, and takes nothing from the ones below.
 * - `moveTo` / `reprioritize`: a drag (or a keyboard move) as a new order,
 *   and the priorities that store it (1, 2, 3… for the cards in order).
 */

import type { PlannerData } from '@gdt/game-data'
import {
  planTotals,
  type PlanGoal,
  type PlanOptions,
  type PlanTotals,
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

/** Readiness and chips per id, `items` in priority order (highest first). */
export function allocateNeeds(
  planner: PlannerData,
  items: readonly AllocationItem[],
  bag: Bag,
  options: PlanOptions,
): Map<string, GoalNeeds> {
  const result = new Map<string, GoalNeeds>()
  const above: PlanGoal[] = []
  let before: PlanTotals | null = null
  for (const item of items) {
    if (!item.goal) continue
    const self = { ...item.goal, active: true }
    const alone = planTotals(planner, [self], bag, options)
    const after = above.length ? planTotals(planner, [...above, self], bag, options) : alone
    result.set(item.id, needsBetween(planner, item.goal, alone, before, after))
    if (item.active) {
      above.push(self)
      before = after
    }
  }
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
