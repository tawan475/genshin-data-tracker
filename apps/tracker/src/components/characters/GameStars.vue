<script setup lang="ts">
import { Star } from 'lucide-vue-next'

/**
 * Rarity as the game's character and weapon screens draw it: gold stars for
 * every rarity (the `game-star` token), with a slight shadow so they read on
 * art. The count is the accessible name. `size` md for lines of text, lg for
 * headings.
 */
withDefaults(defineProps<{ rarity: number; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const SIZE = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const
</script>

<template>
  <span
    class="inline-flex items-center gap-px text-game-star drop-shadow-sm"
    :aria-label="`${rarity} star`"
    role="img"
  >
    <Star
      v-for="n in rarity"
      :key="n"
      class="fill-current stroke-[1.5]"
      :class="SIZE[size]"
      aria-hidden="true"
    />
  </span>
</template>
