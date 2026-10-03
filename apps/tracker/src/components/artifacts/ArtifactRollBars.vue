<script setup lang="ts">
import { ROLL_QUALITY_BG, ROLL_QUALITY_HEIGHT, type InferredRoll } from '@/utils/artifact-rolls'

/**
 * One bar per roll, best first. Taller and warmer means a higher tier, so the
 * quality reads without relying on colour alone. Decorative: the caller puts
 * the roll count in text.
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
