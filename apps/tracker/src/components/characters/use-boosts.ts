import { loadPlanner, type PlannerData } from '@gdt/game-data'
import { constellationBoosts } from '@gdt/game-data/planner-math'
import { computed, shallowRef, type ComputedRef } from 'vue'
import type { ConstellationBoosts } from '@/data/character-build'

/**
 * Which talents a character's C3 and C5 raise, from the planner data
 * (loaded once, on first use; the Planner and Materials pages share it).
 * null until it has loaded, or when it fails: talents then show base levels.
 */
const planner = shallowRef<PlannerData | null>(null)
let loading: Promise<void> | null = null

export function useConstellationBoosts(key: () => string): ComputedRef<ConstellationBoosts | null> {
  loading ??= loadPlanner().then(
    (data) => {
      planner.value = data
    },
    () => {
      loading = null
    },
  )
  return computed(() => (planner.value ? constellationBoosts(planner.value, key()) : null))
}
