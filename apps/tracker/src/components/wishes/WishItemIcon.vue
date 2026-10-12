<script setup lang="ts">
import type { WishItem } from '@gdt/shared'
import GameIcon from '@/components/ui/GameIcon.vue'
import type { Outcome } from '@/data/wish-history'
import { wishIcon } from './wish-labels'

/**
 * A pulled item's icon with the 50/50 as a ring inside its edge: green won,
 * red lost, indigo guaranteed; none on banners without one.
 */
withDefaults(
  defineProps<{ item: WishItem; outcome?: Outcome | null; size?: 'sm' | 'md' | 'lg' }>(),
  { outcome: null, size: 'md' },
)

const RING: Record<Outcome, string> = {
  won: 'ring-success-text',
  lost: 'ring-danger-text',
  guaranteed: 'ring-accent-text',
}
const SIZE = { sm: 'size-6!', md: 'size-[1.9rem]!', lg: 'size-8!' } as const
</script>

<template>
  <span class="relative inline-flex shrink-0">
    <GameIcon
      :src="wishIcon(item)"
      :name="item.name"
      :rarity="item.rank || undefined"
      size="xs"
      :class="SIZE[size]"
    />
    <span
      v-if="outcome"
      class="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset"
      :class="RING[outcome]"
      aria-hidden="true"
    />
  </span>
</template>
