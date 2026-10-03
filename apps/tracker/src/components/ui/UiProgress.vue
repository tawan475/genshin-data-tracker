<script setup lang="ts">
import { computed } from 'vue'

/** Determinate progress. Always pair it with the real numbers in text nearby. */
const props = defineProps<{
  value: number
  max: number
  tone?: 'accent' | 'danger'
  label: string
}>()
const percent = computed(() => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0))
</script>

<template>
  <div
    class="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="value"
    :aria-valuemax="max"
    aria-valuemin="0"
  >
    <div
      class="h-full rounded-full transition-[width] duration-300"
      :class="tone === 'danger' ? 'bg-danger' : 'bg-accent'"
      :style="{ width: `${percent}%` }"
    />
  </div>
</template>
