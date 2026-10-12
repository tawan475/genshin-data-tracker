<script setup lang="ts">
/**
 * The way to hard pity: the pulls so far filled in gold, soft pity's stretch
 * shaded behind it.
 */
withDefaults(
  defineProps<{ pity: number; hard: number; soft: number; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)
const HEIGHT = { sm: 'h-2', md: 'h-2.5', lg: 'h-3.5' } as const
</script>

<template>
  <div
    class="relative overflow-hidden rounded-full bg-surface-sunken"
    :class="HEIGHT[size]"
    role="img"
    :aria-label="`Pity ${pity} of ${hard}, soft pity from ${soft}`"
  >
    <div
      class="absolute inset-y-0 right-0 bg-rarity-5/15"
      :style="{ left: `${(soft / hard) * 100}%` }"
    />
    <div
      class="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-paimon to-rarity-5"
      :style="{ width: `${Math.min(100, (pity / hard) * 100)}%` }"
    />
  </div>
</template>
