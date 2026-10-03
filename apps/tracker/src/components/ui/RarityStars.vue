<script setup lang="ts">
import { Star } from 'lucide-vue-next'

/** "★★★★★" in the rarity's data colour; the count is in the accessible name. */
defineProps<{ rarity: number }>()

const color: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-rarity-3',
  2: 'text-rarity-2',
  1: 'text-rarity-1',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-px"
    :class="color[rarity] ?? 'text-text-muted'"
    :aria-label="`${rarity} star`"
    role="img"
  >
    <Star v-for="n in rarity" :key="n" class="size-3.5 fill-current" aria-hidden="true" />
  </span>
</template>
