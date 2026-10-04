<script setup lang="ts">
import { ROLL_QUALITY_BG, ROLL_QUALITY_HEIGHT, type InferredRoll } from '@/utils/artifact-rolls'

/**
 * One bar per roll, best first: taller and warmer is a higher tier (the
 * Artifacts page's legend). Decorative; the caller's tooltip has the values.
 */
defineProps<{ rolls: readonly InferredRoll[] }>()
</script>

<template>
  <span class="flex h-4 w-12 shrink-0 items-end gap-0.5" aria-hidden="true">
    <span
      v-for="(roll, index) in rolls"
      :key="index"
      class="w-1.5 rounded-sm"
      :class="[ROLL_QUALITY_BG[roll.quality], ROLL_QUALITY_HEIGHT[roll.quality]]"
    />
  </span>
</template>
