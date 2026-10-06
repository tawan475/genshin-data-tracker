<script setup lang="ts">
/** Refinement as the game counts it: "R3" and five pips, three filled. */
defineProps<{ value: number }>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5" :title="`Refinement ${value} of 5`">
    <span class="tabular font-mono">R{{ value }}</span>
    <span class="inline-flex gap-0.5" aria-hidden="true">
      <span
        v-for="n in 5"
        :key="n"
        class="h-1.5 w-2.5 rounded-full"
        :class="n <= value ? 'bg-accent' : 'bg-border-strong'"
      />
    </span>
  </span>
</template>
