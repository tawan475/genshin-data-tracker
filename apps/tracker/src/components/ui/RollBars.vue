<script setup lang="ts">
import { ROLL_QUALITY_BG, ROLL_QUALITY_FILL, type InferredRoll } from '@/utils/artifact-rolls'

/**
 * A substat's rolls as bars, best first: a track per roll filled by its tier
 * and coloured by it, so quality reads by height as well as colour. `size`
 * sm for table cells, md for cards, lg for the details. Decorative: the
 * caller puts the values in text or a tooltip.
 */
withDefaults(defineProps<{ rolls: readonly InferredRoll[]; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

const BOX = { sm: 'h-3.5 w-8 gap-px', md: 'h-4 w-12 gap-0.5', lg: 'h-5 w-[4.25rem] gap-1' }
const BAR = { sm: 'w-1', md: 'w-1.5', lg: 'w-2' }
</script>

<template>
  <span class="flex shrink-0 items-stretch" :class="BOX[size]" aria-hidden="true">
    <span
      v-for="(roll, index) in rolls"
      :key="index"
      class="relative overflow-hidden rounded-[2px] bg-surface-overlay"
      :class="BAR[size]"
    >
      <span
        class="absolute inset-x-0 bottom-0 rounded-[2px]"
        :class="ROLL_QUALITY_BG[roll.quality]"
        :style="{ height: ROLL_QUALITY_FILL[roll.quality] }"
      />
    </span>
  </span>
</template>
