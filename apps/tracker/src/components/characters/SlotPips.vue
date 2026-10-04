<script setup lang="ts">
/** Artifacts worn out of five, as five small bars (shown when some are missing). */
defineProps<{ count: number }>()
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-0.5"
    role="img"
    :aria-label="`${count} of 5 artifacts`"
    :title="`${count} of 5 artifacts`"
  >
    <span
      v-for="n in 5"
      :key="n"
      class="h-3 w-1.5 rounded-sm"
      :class="n <= count ? 'bg-warning-text/70' : 'border border-warning-text/60'"
    />
  </span>
</template>
