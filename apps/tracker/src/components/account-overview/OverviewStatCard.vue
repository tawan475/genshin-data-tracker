<script setup lang="ts">
/** One of the original overview's stat cards: an uppercase label over a figure (the slot). */
defineProps<{ label: string }>()
</script>

<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors"
  >
    <h3
      class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
    >
      {{ label }}
    </h3>
    <slot />
  </div>
</template>
