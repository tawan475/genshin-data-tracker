<script setup lang="ts">
/** Irminsul setup in its own UI's words: Tracker section, settings button, the auto-export box. */
const steps = [
  'Irminsul → Tracker → settings: paste both',
  'Tick "Auto export to tracker"',
  'Start Irminsul before the game',
]
</script>

<template>
  <ol class="flex flex-col gap-1.5 text-sm text-text-secondary">
    <li v-for="(step, index) in steps" :key="index" class="flex gap-2">
      <span class="tabular font-mono text-text-muted" aria-hidden="true">{{ index + 1 }}</span>
      {{ step }}
    </li>
  </ol>
</template>
