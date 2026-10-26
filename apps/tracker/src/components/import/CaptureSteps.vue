<script setup lang="ts">
/** Setting the capture app up with a key, in its own UI's words: Tracker section, settings button, the auto-export box. */
const steps = ['paste', 'tick', 'start'] as const
</script>

<template>
  <ol class="flex flex-col gap-1.5 text-sm text-text-secondary">
    <li v-for="(step, index) in steps" :key="index" class="flex gap-2">
      <span class="tabular font-mono text-text-muted" aria-hidden="true">{{ index + 1 }}</span>
      {{ $t(`transfer.steps.${step}`) }}
    </li>
  </ol>
</template>
