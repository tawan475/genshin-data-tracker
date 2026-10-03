<script setup lang="ts">
import { computed } from 'vue'
import { formatCompact, formatNumber } from '@/lib/format'
import ChangeValue from './ChangeValue.vue'

/**
 * Label + number + signed change since the previous snapshot. Like UiStat,
 * without its "since previous" words: the sign says it, the tooltip spells it.
 */
const props = defineProps<{
  label: string
  value: number | null
  /** undefined: not known yet (loading); null: not measurable. */
  delta?: number | null
  /** Extra detail, shown as a tooltip on the value. */
  detail?: string
}>()

const shown = computed(() => (props.value === null ? '—' : formatCompact(props.value)))
const title = computed(() => {
  const exact = props.value === null ? undefined : formatNumber(props.value)
  return [exact, props.detail].filter(Boolean).join(' · ') || undefined
})
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1 rounded-xl border border-border-default bg-surface-raised p-4"
  >
    <span class="text-sm text-text-secondary">{{ label }}</span>
    <span class="tabular truncate font-mono text-2xl font-medium" :title="title">{{ shown }}</span>
    <span class="min-h-5 text-sm leading-5">
      <ChangeValue
        v-if="delta !== undefined && delta !== null"
        :value="delta"
        hint="since previous snapshot"
      />
    </span>
  </div>
</template>
