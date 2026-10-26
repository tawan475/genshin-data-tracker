import { loadPlanner, type PlannerData } from '@gdt/game-data'
import { computed, shallowRef, type ComputedRef } from 'vue'
import { levelCap } from '@/lib/level'

/**
 * The EXP the next level needs, from the planner data's tables, so a captured
 * EXP (Teyvat.me Capture's `gi_exp`, `exp`, `friendshipExp`) reads as
 * "12,345 / 155,550". null at a cap: there EXP doesn't count (an ascension
 * caps the level; past 90 characters rise with Masterless Stardust).
 */
export interface ExpNeed {
  character(level: number, ascension: number): number | null
  weapon(rarity: number, level: number, ascension: number): number | null
  artifact(rarity: number, level: number): number | null
  friendship(level: number): number | null
}

const positive = (n: number | undefined) => (n !== undefined && n > 0 ? n : null)

export function expNeed(planner: PlannerData): ExpNeed {
  return {
    character: (level, ascension) =>
      level < levelCap(ascension, level) ? positive(planner.characterExp[level - 1]) : null,
    weapon: (rarity, level, ascension) =>
      level < levelCap(ascension, level)
        ? positive(planner.weaponExp[rarity - 1]?.[level - 1])
        : null,
    artifact: (rarity, level) => positive(planner.artifactExp[rarity - 1]?.[level]),
    friendship: (level) => positive(planner.friendshipExp[level - 1]),
  }
}

const planner = shallowRef<PlannerData | null>(null)
let loading: Promise<void> | null = null

/** The lookups, once the planner data has loaded (on first use); null until then or on failure. */
export function useExpNeed(): ComputedRef<ExpNeed | null> {
  loading ??= loadPlanner().then(
    (data) => {
      planner.value = data
    },
    () => {
      loading = null
    },
  )
  return computed(() => (planner.value ? expNeed(planner.value) : null))
}
