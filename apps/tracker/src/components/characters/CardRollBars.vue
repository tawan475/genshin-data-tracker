<script setup lang="ts">
import { ROLL_QUALITY_BG, ROLL_QUALITY_FILL, type InferredRoll } from '@/utils/artifact-rolls'

/**
 * A substat's rolls on the share card, big enough to read at a glance: one
 * bar per roll (best first) filled to its tier and coloured by it, after
 * the roll count; the box keeps room for six, so counts and bars line up
 * down a piece. Decorative bars; the count and the tooltip carry the values.
 */
defineProps<{ rolls: readonly InferredRoll[] }>()
</script>

<template>
  <span class="flex shrink-0 items-center gap-1.5">
    <span class="tabular w-3 text-right font-mono text-[13px] leading-none text-text-muted">{{
      rolls.length || ''
    }}</span>
    <span class="flex h-[18px] w-[51px] items-stretch gap-[3px]" aria-hidden="true">
      <span
        v-for="(roll, index) in rolls"
        :key="index"
        class="relative w-[6px] overflow-hidden rounded-[2px] bg-surface-overlay"
      >
        <span
          class="absolute inset-x-0 bottom-0 rounded-[2px]"
          :class="ROLL_QUALITY_BG[roll.quality]"
          :style="{ height: ROLL_QUALITY_FILL[roll.quality] }"
        />
      </span>
    </span>
  </span>
</template>
