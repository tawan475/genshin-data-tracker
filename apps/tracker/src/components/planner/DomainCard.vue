<script setup lang="ts">
import type { DomainEntry } from '@gdt/game-data'
import type { EstimateStatus, FarmGroup, RunEstimate } from '@gdt/game-data/planner-estimate'
import { WEEKDAY_LABELS } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import GoalAvatars from './GoalAvatars.vue'
import MaterialCell from './MaterialCell.vue'
import RunBadge from './RunBadge.vue'

/**
 * One domain entrance (Seelie's domain card): its families something needs,
 * each with its days and tiers, and the runs for all of them. Open today
 * (with something missing) gets the accent; on Sunday every domain is open.
 */
const props = defineProps<{
  entry: DomainEntry
  groups: readonly FarmGroup[]
  run: RunEstimate | null
  status: EstimateStatus
  goals: readonly string[]
  today: number
  /** Smaller tiles, no portraits (schedule, today). */
  compact?: boolean
}>()

const highlight = computed(
  () =>
    props.today !== 0 &&
    props.groups.some((g) => g.missing > 0 && g.weekdays.includes(props.today)),
)
const days = (g: FarmGroup) => g.weekdays.filter((d) => d !== 0)
const dayNames = (g: FarmGroup) =>
  days(g)
    .map((d) => WEEKDAY_LABELS[d] ?? '')
    .join(', ')
const title = computed(
  () =>
    `${props.entry.name} · ${props.entry.kind === 'talent' ? 'Talent books' : 'Weapon materials'}`,
)
</script>

<template>
  <article
    class="flex min-w-0 flex-col gap-3 rounded-xl border bg-surface-raised shadow-sm"
    :class="[
      highlight ? 'border-accent-text ring-1 ring-accent-text' : 'border-border-default',
      compact ? 'p-2.5' : 'p-3',
    ]"
  >
    <header class="flex items-center gap-2">
      <h3
        class="min-w-0 flex-1 truncate font-semibold"
        :class="compact ? 'text-sm' : ''"
        :title="title"
      >
        {{ entry.name || groups.map((g) => g.name).join(' · ') }}
      </h3>
      <RunBadge :run="run" :status="status" />
    </header>
    <div
      v-for="g in groups"
      :key="g.id"
      class="flex flex-col gap-1.5"
      :class="g.missing === 0 ? 'opacity-70' : ''"
    >
      <div class="flex items-center gap-2 text-sm">
        <span class="min-w-0 truncate font-medium" :title="g.name">{{ g.name }}</span>
        <span class="flex shrink-0 gap-1" :aria-label="dayNames(g)">
          <span
            v-for="d in days(g)"
            :key="d"
            class="rounded px-1.5 py-0.5 text-xs font-medium"
            :class="
              d === today ? 'bg-accent text-accent-ink' : 'bg-surface-overlay text-text-secondary'
            "
            >{{ WEEKDAY_LABELS[d] }}</span
          >
        </span>
        <span v-if="groups.length > 1" class="ml-auto">
          <RunBadge :run="g.run" :status="g.status" />
        </span>
      </div>
      <div class="flex flex-wrap items-end gap-x-1 gap-y-2">
        <MaterialCell
          v-for="line in g.lines"
          :key="line.material.key"
          :line="line"
          :size="compact ? 'sm' : 'md'"
        />
      </div>
    </div>
    <div v-if="!compact && goals.length" class="mt-auto flex justify-end">
      <GoalAvatars :goals="goals" :max="6" />
    </div>
  </article>
</template>
