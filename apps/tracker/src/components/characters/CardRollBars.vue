<script setup lang="ts">
import type { InferredRoll, RollQuality } from '@/utils/artifact-rolls'

/**
 * A substat's rolls on the share card: one 7×24px bar per roll (best first),
 * as tall as the roll's tier (70–100 % of 24px) and coloured by it (the
 * card's `--card-roll-1…4`), in a box with room for six (57px); then "×N". Bars
 * are decorative; the count and the tooltip carry the values.
 */
defineProps<{ rolls: readonly InferredRoll[] }>()

const TIER: Record<RollQuality, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1 }
</script>

<template>
  <span class="flex shrink-0 items-center gap-[6px]">
    <span class="flex h-[24px] w-[57px] items-end gap-[3px]" aria-hidden="true">
      <span
        v-for="(roll, index) in rolls"
        :key="index"
        class="w-[7px] rounded-[2px]"
        :style="{
          height: `${Math.round(24 * TIER[roll.quality])}px`,
          background: `var(--card-roll-${roll.quality})`,
        }"
      />
    </span>
    <span class="w-[22px] text-right text-[15px] text-(--card-muted)">{{
      rolls.length ? `×${rolls.length}` : ''
    }}</span>
  </span>
</template>
