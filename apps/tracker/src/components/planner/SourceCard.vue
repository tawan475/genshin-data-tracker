<script setup lang="ts">
import type { PlannerMaterial } from '@gdt/game-data'
import type { Conversion } from '@gdt/game-data/planner-convert'
import type { FarmGroup } from '@gdt/game-data/planner-estimate'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'
import RunBadge from './RunBadge.vue'
import ConversionList from './ConversionList.vue'

/**
 * One farming source that isn't a domain: a gem family, a single boss drop,
 * a specialty, an enemy family or the crown (`compact` for single items).
 * The estimate sits under the name; gems list the Dust of Azoth conversions.
 */
defineProps<{
  group: FarmGroup
  compact?: boolean
  /** Conversions into this family (Dust of Azoth). */
  conversions?: readonly Conversion[]
  /** What the conversions spend. */
  via?: PlannerMaterial
}>()
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default bg-surface-raised shadow-sm"
    :class="compact ? 'p-2.5' : 'p-3'"
  >
    <template v-if="compact">
      <div class="flex items-center gap-2.5">
        <MaterialCell v-for="line in group.lines" :key="line.material.key" :line="line" />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5 self-start pt-0.5">
          <h3 class="truncate text-sm font-medium" :title="group.name">{{ group.name }}</h3>
          <GoalAvatars :goals="group.goals" :max="4" />
          <RunBadge :run="group.run" :status="group.status" />
        </div>
      </div>
    </template>

    <template v-else>
      <header class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <h3 class="max-w-full min-w-0 truncate font-semibold" :title="group.name">
          {{ group.name }}
        </h3>
        <span class="ml-auto"><RunBadge :run="group.run" :status="group.status" /></span>
      </header>
      <div class="flex flex-wrap content-start items-end gap-x-1 gap-y-2">
        <MaterialCell v-for="line in group.lines" :key="line.material.key" :line="line" />
        <span class="ml-auto pb-0.5 pl-2">
          <GoalAvatars :goals="group.goals" :max="5" />
        </span>
      </div>
      <ConversionList v-if="conversions?.length && via" :conversions="conversions" :via="via" />
    </template>
  </article>
</template>
