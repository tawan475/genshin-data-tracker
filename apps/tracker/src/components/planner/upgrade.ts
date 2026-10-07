/**
 * Two facts about a goal card for the Goals filters, pure:
 *
 * - `partReadiness`: which of its parts (Level, Talents, each weapon; the
 *   Done parts of done.ts) can go up now with the bag on its own: `full`,
 *   the whole part (its cost covered and nothing in the way: the Adventure
 *   Rank an ascension needs, the ascension talents need), or `step`, its
 *   next step only (the next level band or ascension, one talent level).
 *   A card with any is "Upgrade now". The bag alone, like Ready alone: what
 *   the game lets you do right now, even when it takes materials the goals
 *   above it are counting on.
 * - `needsWeekly`: whether what is left needs a weekly boss material (the
 *   game data's `weekly` kind: Dvalin's Plume, Shard of a Foul Legacy…).
 */

import type { PlannerData } from '@gdt/game-data'
import { affordable, nextCharacterStep, nextWeaponStep } from '@gdt/game-data/planner-goals'
import {
  TALENTS,
  ascensionForTalents,
  characterRequirement,
  type PlanOptions,
  type Requirement,
} from '@gdt/game-data/planner-math'
import { characterParts, weaponPart } from './done'
import type { GoalEntry } from './model'

type Bag = Readonly<Record<string, number>>

export type PartReady = 'full' | 'step'

/**
 * Per Done part id (`${goal id}|level`, `${goal id}|talents`,
 * `${weapon goal id}|weapon`), the parts that can go up now; a part that
 * can't isn't in the map.
 */
export function partReadiness(
  planner: PlannerData,
  entry: GoalEntry,
  bag: Bag,
  options: PlanOptions & { ar?: number | null },
): Map<string, PartReady> {
  const ready = new Map<string, PartReady>()
  if (entry.materialsDone) return ready
  const c = entry.character
  if (c && !c.done) {
    for (const part of characterParts(planner, c)) {
      if (part.kind === 'level') {
        // Levels and ascensions only: the talents stay where they are.
        const step = nextCharacterStep(
          planner,
          c.key,
          c.current,
          { level: c.target.level, ascension: c.target.ascension, talents: c.current.talents },
          bag,
          options,
        )
        if (step) ready.set(part.id, step.full ? 'full' : 'step')
        continue
      }
      // Talents: one level of any of them within the ascension reached, or all of them.
      const now = c.current
      const goal = { ...now.talents }
      for (const t of TALENTS) goal[t] = Math.max(now.talents[t], c.target.talents[t])
      const reachable = ascensionForTalents(goal, planner.talentAscension) <= now.ascension
      if (reachable && affordable(planner, part.requirement, bag, options)) {
        ready.set(part.id, 'full')
        continue
      }
      const oneUp = TALENTS.some((t) => {
        if (now.talents[t] >= goal[t]) return false
        const talents = { ...now.talents, [t]: now.talents[t] + 1 }
        if (ascensionForTalents(talents, planner.talentAscension) > now.ascension) return false
        const r = characterRequirement(
          planner,
          c.key,
          now,
          { ...now, talents },
          { talentCaps: false },
        )
        return !!r && affordable(planner, r, bag, options)
      })
      if (oneUp) ready.set(part.id, 'step')
    }
  }
  for (const w of entry.weapons) {
    const part = weaponPart(planner, w)
    if (!part) continue
    const step = nextWeaponStep(planner, w.key, w.current, w.target, bag, options)
    if (step) ready.set(part.id, step.full ? 'full' : 'step')
  }
  return ready
}

/** Whether a cost needs any weekly boss material. */
export function needsWeekly(planner: PlannerData, requirement: Requirement | null | undefined) {
  if (!requirement) return false
  for (const [key, count] of requirement.items) {
    if (count > 0 && planner.materialsByKey.get(key)?.kind === 'weekly') return true
  }
  return false
}
