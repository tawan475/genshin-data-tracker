<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber, formatSigned } from '@/lib/format'

/**
 * A signed count change ("+160", "−684K"), green up, red down; the sign
 * carries the meaning too. Exact value and `hint` in the tooltip. Renders
 * nothing for null (no comparison) unless `dash` is set.
 */
const props = defineProps<{ value: number | null | undefined; hint?: string; dash?: boolean }>()

const tone = computed(() => {
  const v = props.value
  if (!v) return 'text-text-muted'
  return v > 0 ? 'text-success-text' : 'text-danger-text'
})
const title = computed(() => {
  const v = props.value
  if (v === null || v === undefined) return props.hint
  const exact = v === 0 ? '0' : `${v > 0 ? '+' : '−'}${formatNumber(Math.abs(v))}`
  return [exact, props.hint].filter(Boolean).join(' ')
})
</script>

<template>
  <span
    v-if="(value !== null && value !== undefined) || dash"
    class="tabular font-mono"
    :class="tone"
    :title="title"
    >{{ value === null || value === undefined ? '—' : formatSigned(value) }}</span
  >
</template>
