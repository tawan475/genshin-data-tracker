/**
 * What the Planner knows that alerts are worked out from (docs/plans/
 * capture-link.md): the resin it counts from, the one set by hand, the
 * capture's tasks and the built-in tasks ticked by hand. Captures tell the
 * server themselves; the page adds what only it knows (hand edits) and what
 * was known before a device turned alerts on. Sent when it changes, only
 * while someone of this account has alerts (the server says so).
 */

import type { ManualResin, PlannerTask } from '@gdt/shared'
import type { CapturedTasks } from './tasks'

export interface AlertFactsInput {
  /** The capture's resin (`ResinNow` when known): the count and when it was read. */
  capture: { value: number; at: number } | null
  manual: ManualResin | null | undefined
  captured: CapturedTasks | null | undefined
  rows: readonly PlannerTask[] | null | undefined
  now: number
}

/** The facts as the server's `alert-facts` route takes them (unknown parts left out). */
export function alertFactsOf(input: AlertFactsInput): Record<string, unknown> {
  const facts: Record<string, unknown> = { manual: input.manual ?? null }
  if (input.capture) facts.resin = { value: input.capture.value, at: input.capture.at }
  const captured = input.captured
  if (captured) {
    const at = captured.at
    const tasks = captured.tasks
    if (tasks.resin) facts.clock = tasks.resin
    if (tasks.expeditions) {
      facts.expeditions = { doneAt: tasks.expeditions.slice(0, 20).map((e) => e.doneAt * 1000), at }
    }
    if (tasks.welkin) facts.welkin = { days: tasks.welkin.days, at }
    if (tasks.commissions) {
      facts.commissions = {
        finished: tasks.commissions.finished,
        total: tasks.commissions.total,
        at,
      }
    }
    if (tasks.bargains)
      facts.bargains = { bought: tasks.bargains.bought, at: tasks.bargains.at * 1000 }
  }
  // A built-in ticked by hand is done until its `next`.
  const ticks: Record<string, number> = {}
  for (const row of input.rows ?? []) {
    if (row.kind !== 'builtin' || (row.id !== 'commissions' && row.id !== 'bargains')) continue
    if (row.next && row.next > input.now) ticks[row.id] = row.updatedAt
  }
  if (Object.keys(ticks).length) facts.ticks = ticks
  return facts
}
