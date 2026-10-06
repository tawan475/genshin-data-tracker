/**
 * The Planner's hand edits on top of the newest capture, pure:
 *
 * - material counts (`InventoryAdjustment`): the count is `set ?? the
 *   capture's`, plus `delta`, for as long as the newest capture is the one
 *   the edit was made against (or older). A newer capture replaces every
 *   older edit: irminsul is the truth, so the planner never drifts from the
 *   game. With no capture at all the bag starts empty and edits are all
 *   there is.
 * - a goal's current state (`CurrentOverride`): counts where it is ahead of
 *   the capture, field by field (a level/ascension pair as one), so a
 *   capture that reaches it retires it without anyone clearing it.
 *
 * The worker applies the same rules in SQL (worker/routes/progress.ts); the
 * page applies pending edits with these to show them before the server
 * answers.
 */

import type { CharacterState, Talents, WeaponState } from '@gdt/game-data/planner-math'
import type {
  CharacterCurrent,
  CurrentOverride,
  InventoryAdjustment,
  InventoryChange,
  WeaponCurrent,
} from '@gdt/shared'

type Bag = Readonly<Record<string, number>>

const count = (value: number | undefined) =>
  Math.max(0, Math.trunc(Number.isFinite(value) ? (value as number) : 0))

// ------------------------------------------------------------- material counts

/** Whether an edit made against the capture seen at `edit.base` still counts with the newest at `capturedAt`. */
export function adjustmentApplies(edit: Pick<InventoryAdjustment, 'base'>, capturedAt: number) {
  return edit.base >= capturedAt
}

/** The count an edit gives, over the capture's count. */
export function adjustedCount(capture: number, edit: Pick<InventoryAdjustment, 'set' | 'delta'>) {
  return Math.max(0, (edit.set ?? count(capture)) + edit.delta)
}

/**
 * The bag the planner works with: the capture's counts (none without a
 * capture) with every edit that still applies.
 */
export function effectiveInventory(
  capture: Bag,
  adjustments: readonly InventoryAdjustment[],
  capturedAt: number,
): Record<string, number> {
  const bag: Record<string, number> = { ...capture }
  for (const edit of adjustments) {
    if (adjustmentApplies(edit, capturedAt))
      bag[edit.key] = adjustedCount(capture[edit.key] ?? 0, edit)
  }
  return bag
}

/** Edits a newer capture has replaced (still stored until the next write). */
export function replacedAdjustments(
  adjustments: readonly InventoryAdjustment[],
  capturedAt: number,
): InventoryAdjustment[] {
  return adjustments.filter((edit) => !adjustmentApplies(edit, capturedAt))
}

/**
 * Two changes to one material as one (the page sends one per material): a
 * `set` replaces what came before it; adds add up, on top of an earlier set.
 */
export function mergeChange(before: InventoryChange | undefined, next: InventoryChange) {
  if (next.set !== undefined || !before) return { ...next }
  const add = (before.add ?? 0) + (next.add ?? 0)
  return before.set !== undefined ? { key: next.key, set: before.set, add } : { key: next.key, add }
}

/**
 * What the server will store after `changes` made against the capture seen
 * at `base` (the page shows this until it answers): replaced edits dropped,
 * sets and adds applied, edits that add up to nothing removed.
 */
export function applyChanges(
  adjustments: readonly InventoryAdjustment[],
  changes: Iterable<InventoryChange>,
  base: number,
  now: number,
): InventoryAdjustment[] {
  const byKey = new Map(
    adjustments.filter((edit) => adjustmentApplies(edit, base)).map((edit) => [edit.key, edit]),
  )
  for (const change of changes) {
    const before = byKey.get(change.key)
    const next: InventoryAdjustment =
      change.set !== undefined
        ? { key: change.key, set: change.set ?? null, delta: change.add ?? 0, base, updatedAt: now }
        : {
            key: change.key,
            set: before?.set ?? null,
            delta: (before?.delta ?? 0) + (change.add ?? 0),
            base,
            updatedAt: now,
          }
    if (next.set === null && next.delta === 0) byKey.delete(change.key)
    else byKey.set(change.key, next)
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/**
 * The change that makes a material's count `value`: back to the capture
 * (no edit) when that is the capture's count, else a set.
 */
export function countChange(key: string, value: number, capture: number): InventoryChange {
  const n = count(value)
  return n === count(capture) ? { key, set: null } : { key, set: n }
}

// ------------------------------------------------------------- current state

export const overrideId = (o: Pick<CurrentOverride, 'kind' | 'key' | 'owner'>) =>
  o.kind === 'character' ? `character:${o.key}` : `weapon:${o.key}:${o.owner}`

/** Whether (level, ascension) `a` is past `b`: a higher phase, or the same phase at a higher level. */
function pairAhead(
  a: { level: number; ascension: number },
  b: { level: number; ascension: number },
) {
  return a.ascension > b.ascension || (a.ascension === b.ascension && a.level > b.level)
}

/**
 * A character's current state: the capture's, with a hand-set state where
 * that is ahead of it. `edited` says whether the hand-set one shows.
 */
export function characterNow(
  capture: CharacterState,
  override: CharacterCurrent | null | undefined,
): { state: CharacterState; edited: boolean } {
  if (!override) return { state: capture, edited: false }
  const pair = pairAhead(override, capture) ? override : capture
  const talents = {} as Talents
  let edited = pair === override
  for (const t of ['auto', 'skill', 'burst'] as const) {
    talents[t] = Math.max(capture.talents[t], override.talents[t])
    if (override.talents[t] > capture.talents[t]) edited = true
  }
  return { state: { level: pair.level, ascension: pair.ascension, talents }, edited }
}

/** A weapon's current state: the capture's, with a hand-set one where that is ahead of it. */
export function weaponNow(
  capture: WeaponState,
  override: WeaponCurrent | null | undefined,
): { state: WeaponState; edited: boolean } {
  if (!override) return { state: capture, edited: false }
  const ahead = pairAhead(override, capture)
  const pair = ahead ? override : capture
  const refinement = Math.max(capture.refinement, override.refinement)
  return {
    state: { level: pair.level, ascension: pair.ascension, refinement },
    edited: ahead || override.refinement > capture.refinement,
  }
}
