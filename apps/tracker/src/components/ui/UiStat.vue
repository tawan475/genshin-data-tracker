<script setup lang="ts">
import { computed } from 'vue'
import { formatCompact, formatNumber, formatSigned } from '@/lib/format'

/**
 * A stat tile. `value` is shown compact with the exact figure in the title;
 * `delta` (change since the previous snapshot) is coloured by direction.
 */
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
    class="flex min-w-0 flex-col gap-1 rounded-xl border border-border-default bg-surface-raised p-4"
  >
    <span class="flex items-center gap-2 text-sm text-text-secondary">
      <slot name="icon" />
      {{ label }}
    </span>
    <span class="tabular truncate font-mono text-2xl font-medium" :title="title">{{ shown }}</span>
    <span
      v-if="delta !== undefined && delta !== null"
      class="tabular font-mono text-sm"
      :class="delta > 0 ? 'text-success-text' : delta < 0 ? 'text-danger-text' : 'text-text-muted'"
    >
      {{ formatSigned(delta) }}
      <span class="font-sans text-text-muted">since previous</span>
    </span>
    <span v-else-if="hint" class="text-sm text-text-muted">{{ hint }}</span>
  </div>
</template>
