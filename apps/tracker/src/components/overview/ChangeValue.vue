<script setup lang="ts">
import { computed } from 'vue'
import { formatSigned } from '@/lib/format'
import { formatSignedExact } from '@/data/overview'

/**
 * A signed change ("+160", "−684K"), coloured by direction; the sign always
 * carries the meaning too. `null` means "not measurable" and reads "—".
 * `hint` ends the tooltip ("−684,000 since previous snapshot").
 */
const props = defineProps<{ value: number | null; exact?: boolean; hint?: string }>()

const text = computed(() => {
  if (props.value === null) return '—'
  return props.exact ? formatSignedExact(props.value) : formatSigned(props.value)
})
const title = computed(() => {
  const parts = [props.value === null ? undefined : formatSignedExact(props.value), props.hint]
  return parts.filter(Boolean).join(' ') || undefined
})
const tone = computed(() => {
  const v = props.value
  if (v === null || v === 0) return 'text-text-muted'
  return v > 0 ? 'text-success-text' : 'text-danger-text'
})
</script>

<template>
  <span class="tabular font-mono" :class="tone" :title="title">{{ text }}</span>
</template>
