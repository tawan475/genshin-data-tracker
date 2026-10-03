<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * A game image from the Enka CDN with a rarity-tinted backdrop. Falls back to
 * the item's initials when there is no URL or the image fails, so a missing
 * icon never leaves a broken-image glyph.
 */
const props = withDefaults(
  defineProps<{ src: string; name: string; rarity?: number; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)
const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const backdrop: Record<number, string> = {
  5: 'bg-rarity-5/20',
  4: 'bg-rarity-4/20',
  3: 'bg-rarity-3/20',
  2: 'bg-rarity-2/20',
  1: 'bg-rarity-1/20',
}
const initials = computed(() =>
  props.name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
)
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
    :class="[
      { sm: 'size-9', md: 'size-12', lg: 'size-16' }[size],
      rarity ? backdrop[rarity] : 'bg-surface-sunken',
    ]"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name"
      loading="lazy"
      decoding="async"
      class="size-full object-contain"
      @error="failed = true"
    />
    <span v-else class="font-mono text-sm text-text-muted" :title="name">{{ initials }}</span>
  </span>
</template>
