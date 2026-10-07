<script setup lang="ts">
import { computed } from 'vue'

/**
 * Rarity as the game's character and weapon screens draw it: gold stars
 * with a darker gold edge for every rarity (`game-star` tokens), with a
 * slight shadow so they read on art. The count is the accessible name.
 * `size` sm / md / lg for text (14 / 16 / 20px); `px` any size; `gap` in
 * px (a sixth of the size by default).
 */
const props = withDefaults(
  defineProps<{ rarity: number; size?: 'sm' | 'md' | 'lg'; px?: number; gap?: number }>(),
  { size: 'md', px: undefined, gap: undefined },
)
const SIZE_PX = { sm: 14, md: 16, lg: 20 } as const
const STAR =
  'M12 1.8l2.95 6.6 7.2.75-5.4 4.85 1.53 7.08L12 17.4l-6.28 3.68 1.53-7.08-5.4-4.85 7.2-.75z'
const d = computed(() => props.px ?? SIZE_PX[props.size])
</script>

<template>
  <span
    class="inline-flex items-center [filter:drop-shadow(0_1px_2px_rgba(80,50,0,0.5))]"
    :style="{ gap: `${gap ?? Math.round(d / 6)}px` }"
    :aria-label="`${rarity} star`"
    role="img"
  >
    <svg
      v-for="n in rarity"
      :key="n"
      viewBox="0 0 24 24"
      :width="d"
      :height="d"
      class="shrink-0"
      aria-hidden="true"
    >
      <path :d="STAR" fill="var(--game-star)" stroke="var(--game-star-edge)" stroke-width="0.8" />
    </svg>
  </span>
</template>
