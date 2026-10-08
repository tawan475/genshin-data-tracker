<script setup lang="ts">
import { computed } from 'vue'
import { RARITY_GRADIENT, qualityCell } from '@/lib/item-art'

/**
 * The game's bag cell background behind an item (lib/item-art
 * `qualityCell`): the rarity's gradient with the knot, as one sprite
 * stretched over its positioned parent. `small` takes the 50×50 square (for
 * icons and portraits), else the 80×98 cell. A plain gradient shows while it
 * loads; nothing without a rarity, so the parent's own backdrop shows.
 */
const props = defineProps<{ rarity?: number | null; small?: boolean }>()

const ground = computed(() => {
  const art = qualityCell(props.rarity, props.small)
  const fallback = props.rarity ? RARITY_GRADIENT[props.rarity] : undefined
  if (!art || !fallback) return null
  return `url("${art}") 0 0 / 100% 100% no-repeat, ${fallback}`
})
</script>

<template>
  <span
    v-if="ground"
    class="pointer-events-none absolute inset-0"
    :style="{ background: ground }"
    aria-hidden="true"
  />
</template>
