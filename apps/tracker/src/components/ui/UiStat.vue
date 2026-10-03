<script setup lang="ts">
import { computed } from 'vue'
import { formatCompact, formatNumber, formatSigned } from '@/lib/format'

/** Stat tile: small uppercase label, big number, signed change. Exact value in the tooltip. */
const props = defineProps<{
  label: string
  value: number | string | null | undefined
  delta?: number | null
  hint?: string
  exact?: boolean
}>()

const shown = computed(() => {
  if (props.value === null || props.value === undefined) return '—'
  if (typeof props.value === 'string') return props.value
  return props.exact ? formatNumber(props.value) : formatCompact(props.value)
})
const title = computed(() =>
  typeof props.value === 'number' ? formatNumber(props.value) : undefined,
)
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1 rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm"
    :title="hint"
  >
    <span class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-text-muted uppercase">
      <slot name="icon" />
      {{ label }}
    </span>
    <span class="tabular truncate text-2xl font-bold" :title="title">{{ shown }}</span>
    <span
      v-if="delta !== undefined && delta !== null"
      class="tabular text-sm font-medium"
      :class="delta > 0 ? 'text-success-text' : delta < 0 ? 'text-danger-text' : 'text-text-muted'"
    >
      {{ formatSigned(delta) }}
    </span>
  </div>
</template>
