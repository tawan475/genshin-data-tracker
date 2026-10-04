<script setup lang="ts">
import type { PlannerMaterial } from '@gdt/game-data'
import type { FarmWeekly } from '@gdt/game-data/planner-estimate'
import { TriangleAlert } from 'lucide-vue-next'
import { formatNumber } from '@/lib/format'
import ConversionList from './ConversionList.vue'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'
import RunBadge from './RunBadge.vue'

/**
 * One weekly boss: its three materials (Dream Solvent converts between
 * them), the conversions the totals assume, and the claims it takes. The
 * quest-only weekly materials get a card of their own (no boss).
 */
defineProps<{ weekly: FarmWeekly; solvent: PlannerMaterial | null }>()
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm"
  >
    <header class="flex items-center gap-2">
      <h3
        class="min-w-0 flex-1 truncate font-semibold"
        :title="
          weekly.boss ? weekly.boss.name : 'No weekly boss drops it; Dream Solvent can’t make it'
        "
      >
        {{ weekly.boss ? weekly.boss.name : 'Quest only' }}
      </h3>
      <RunBadge :run="weekly.run" :status="weekly.status" weekly />
    </header>
    <div class="flex flex-wrap items-end gap-x-1 gap-y-2">
      <MaterialCell v-for="line in weekly.lines" :key="line.material.key" :line="line" />
      <span class="ml-auto pb-0.5 pl-2">
        <GoalAvatars :goals="weekly.goals" :max="5" />
      </span>
    </div>
    <ConversionList
      v-if="solvent && weekly.conversion?.conversions.length"
      :conversions="weekly.conversion.conversions"
      :via="solvent"
    />
    <p
      v-if="weekly.conversion?.blocked"
      class="flex items-center gap-1.5 text-xs text-warning-text"
      :title="`${formatNumber(weekly.conversion.blocked)} conversions need more Dream Solvent`"
    >
      <TriangleAlert class="size-3.5" aria-hidden="true" />
      {{ formatNumber(weekly.conversion.blocked) }} blocked
      <span class="sr-only">: need more Dream Solvent</span>
    </p>
  </article>
</template>
