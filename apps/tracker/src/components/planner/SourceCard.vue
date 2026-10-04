<script setup lang="ts">
import { WEEKDAY_LABELS, type SourceGroup } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import { formatNumber } from '@/lib/format'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'

/**
 * One farming source: a domain's book or weapon material family, an enemy
 * family, a gem, or a single boss drop or specialty (`compact`). Domains
 * open today get the accent; the days, domain and estimate are in tooltips.
 */
const props = defineProps<{ group: SourceGroup; today: number; compact?: boolean }>()

const days = computed(() => props.group.weekdays.filter((d) => d !== 0))
const open = computed(() => props.group.weekdays.includes(props.today))
/** Every domain is open on Sunday, so the accent only singles domains out on other days. */
const highlight = computed(() => open.value && props.today !== 0 && props.group.missing > 0)
const daysTitle = computed(() =>
  props.group.weekdays.length
    ? `${props.group.domain} · ${props.group.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}`
    : props.group.name,
)
const openLabel = computed(() =>
  open.value ? 'Open today' : `Open ${days.value.map((d) => WEEKDAY_LABELS[d]).join(', ')}`,
)
const estimateTitle = computed(() => {
  const e = props.group.estimate
  return e ? `About ${formatNumber(e.runs)} runs, ${formatNumber(e.resin)} resin (estimate)` : ''
})
</script>

<template>
  <article
    class="flex min-w-0 flex-col rounded-xl border bg-surface-raised shadow-sm"
    :class="[
      highlight ? 'border-accent-text ring-1 ring-accent-text' : 'border-border-default',
      compact ? 'p-2.5' : 'p-3',
    ]"
  >
    <template v-if="compact">
      <div class="flex items-center gap-2.5">
        <MaterialCell v-for="line in group.lines" :key="line.material.key" :line="line" />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5 self-start pt-0.5">
          <h3 class="truncate text-sm font-medium" :title="group.name">{{ group.name }}</h3>
          <GoalAvatars :goals="group.goals" :max="4" />
          <span
            v-if="group.estimate"
            class="tabular font-mono text-xs text-text-muted"
            :title="estimateTitle"
            >~{{ formatNumber(group.estimate.runs) }}×</span
          >
        </div>
      </div>
    </template>

    <template v-else>
      <header class="flex items-center gap-2">
        <h3 class="min-w-0 flex-1 truncate font-semibold" :title="daysTitle">{{ group.name }}</h3>
        <span
          v-if="days.length"
          class="flex shrink-0 gap-1"
          :title="daysTitle"
          :aria-label="openLabel"
        >
          <span
            v-for="d in days"
            :key="d"
            class="rounded px-1.5 py-0.5 text-xs font-medium"
            :class="
              d === today ? 'bg-accent text-accent-ink' : 'bg-surface-overlay text-text-secondary'
            "
            >{{ WEEKDAY_LABELS[d] }}</span
          >
          <span
            v-if="today === 0"
            class="rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-ink"
            >{{ WEEKDAY_LABELS[0] }}</span
          >
        </span>
      </header>
      <div class="mt-3 flex flex-wrap content-start items-end gap-x-1 gap-y-2">
        <MaterialCell v-for="line in group.lines" :key="line.material.key" :line="line" />
        <span class="ml-auto flex flex-col items-end gap-1 pb-0.5 pl-2">
          <span
            v-if="group.estimate"
            class="tabular font-mono text-xs text-text-secondary"
            :title="estimateTitle"
            >~{{ formatNumber(group.estimate.runs) }}×</span
          >
          <GoalAvatars :goals="group.goals" :max="5" />
        </span>
      </div>
    </template>
  </article>
</template>
