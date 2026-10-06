<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressSummary } from '@/data/achievement-progress'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { materialIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

const primogem = materialIcon('Primogem')

/** Done / total, percent, primogems, and a "Missing" tile that filters to what is left. */
const props = defineProps<{ summary: ProgressSummary; missingOnly: boolean }>()
defineEmits<{ toggleMissing: [] }>()

/** Rounded down, so 99.96% is not shown as complete. */
const percent = computed(() => {
  const { done, total } = props.summary
  return total ? Math.floor((done / total) * 1000) / 10 : 0
})
const doneTitle = computed(() => {
  const s = props.summary
  const parts = [`${formatNumber(s.captured)} captured`, `${formatNumber(s.marked)} by hand`]
  if (s.unknown.length) parts.push(`${formatNumber(s.unknown.length)} newer than the game data`)
  return parts.join(' · ')
})
const missing = computed(() => props.summary.total - props.summary.done)
</script>

<template>
  <ul class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4" aria-label="Summary">
    <li class="flex min-w-0">
      <UiStat label="Done" :hint="doneTitle">
        <template #value>
          <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
            {{ formatNumber(summary.done)
            }}<span class="text-sm text-text-muted"> / {{ formatNumber(summary.total) }}</span>
          </span>
        </template>
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat label="Progress" :value="`${percent}%`">
        <UiProgress
          class="mt-1"
          :value="summary.done"
          :max="summary.total"
          label="Achievements done"
        />
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat label="Primogems" hint="Primogems collected / on offer">
        <template #icon><img :src="primogem" alt="" class="size-4" /></template>
        <template #value>
          <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
            {{ formatNumber(summary.primogems)
            }}<span class="text-sm text-text-muted">
              / {{ formatNumber(summary.primogemsTotal) }}</span
            >
          </span>
        </template>
      </UiStat>
    </li>
    <li class="flex min-w-0">
      <UiStat
        label="Missing"
        :value="missing"
        exact
        :hint="missingOnly ? 'Show all' : 'Show only what is left'"
        :tone="missing > 0 ? 'warning' : 'success'"
        :pressed="missingOnly"
        @click="$emit('toggleMissing')"
      />
    </li>
  </ul>
</template>
