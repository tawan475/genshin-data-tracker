<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressSummary } from '@gdt/game-data/achievement-progress'
import UiProgress from '@/components/ui/UiProgress.vue'
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
    <li
      class="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm sm:px-4 sm:py-3"
      :title="doneTitle"
    >
      <span class="text-xs text-text-secondary sm:text-sm">Done</span>
      <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
        {{ formatNumber(summary.done)
        }}<span class="text-sm text-text-muted"> / {{ formatNumber(summary.total) }}</span>
      </span>
    </li>
    <li
      class="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm sm:px-4 sm:py-3"
    >
      <span class="flex items-baseline justify-between gap-2">
        <span class="text-xs text-text-secondary sm:text-sm">Progress</span>
        <span class="tabular font-mono text-lg font-medium sm:text-xl">{{ percent }}%</span>
      </span>
      <UiProgress :value="summary.done" :max="summary.total" label="Achievements done" />
    </li>
    <li
      class="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 shadow-sm sm:px-4 sm:py-3"
      title="Primogems collected / on offer"
    >
      <span class="flex items-center gap-1 text-xs text-text-secondary sm:text-sm">
        <img :src="primogem" alt="" class="size-4" />
        Primogems
      </span>
      <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
        {{ formatNumber(summary.primogems)
        }}<span class="text-sm text-text-muted"> / {{ formatNumber(summary.primogemsTotal) }}</span>
      </span>
    </li>
    <li class="flex min-w-0">
      <button
        type="button"
        :aria-pressed="missingOnly"
        title="Show only what is left"
        class="flex w-full min-w-0 flex-col gap-0.5 rounded-xl border bg-surface-raised px-3 py-2.5 text-left shadow-sm transition-colors sm:px-4 sm:py-3"
        :class="
          missingOnly
            ? 'border-accent-text ring-1 ring-accent-text'
            : 'border-border-default hover:border-border-strong hover:bg-surface-overlay'
        "
        @click="$emit('toggleMissing')"
      >
        <span class="text-xs text-text-secondary sm:text-sm">Missing</span>
        <span
          class="tabular truncate font-mono text-lg font-medium sm:text-xl"
          :class="missing > 0 ? 'text-warning-text' : 'text-success-text'"
          >{{ formatNumber(missing) }}</span
        >
      </button>
    </li>
  </ul>
</template>
