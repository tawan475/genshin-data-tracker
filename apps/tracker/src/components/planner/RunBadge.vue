<script setup lang="ts">
import type { EstimateStatus, RunEstimate, WeeklyRun } from '@gdt/game-data/planner-estimate'
import { computed } from 'vue'
import { runText, runTitle, statusText, statusTitle, weeklyText, weeklyTitle } from './farm-format'

/** A source's estimate: "×12 · 240 · 2d" (details in the tooltip), or why there is none. */
const props = defineProps<{
  run: RunEstimate | WeeklyRun | null
  status: EstimateStatus
  /** The run is a weekly boss's (claims and weeks). */
  weekly?: boolean
}>()

const text = computed(() => {
  const r = props.run
  if (!r) return statusText(props.status)
  return props.weekly && 'weeks' in r ? weeklyText(r) : runText(r)
})
const title = computed(() => {
  const r = props.run
  if (!r) return statusTitle(props.status)
  return props.weekly && 'weeks' in r ? weeklyTitle(r) : runTitle(r)
})
</script>

<template>
  <span
    v-if="text"
    class="tabular font-mono text-xs whitespace-nowrap"
    :class="
      run ? 'text-text-secondary' : status === 'locked' ? 'text-warning-text' : 'text-text-muted'
    "
    :title="title"
    >{{ text }}<span class="sr-only"> ({{ title }})</span></span
  >
</template>
