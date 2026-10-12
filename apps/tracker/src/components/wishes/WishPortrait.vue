<script setup lang="ts">
import type { WishItem } from '@gdt/shared'
import GameIcon from '@/components/ui/GameIcon.vue'
import type { Outcome } from '@/data/wish-history'
import { wishIcon } from './wish-labels'

/**
 * A pulled item's picture in a round frame whose ring tells the 50/50: gold
 * for won (or a banner without one), red for lost, dashed grey for
 * guaranteed.
 */
withDefaults(
  defineProps<{ item: WishItem; outcome?: Outcome | null; size?: 'sm' | 'md' | 'lg' }>(),
  { outcome: null, size: 'md' },
)

const RING: Record<Outcome | 'none', string> = {
  won: 'border-rarity-5',
  lost: 'border-danger-text',
  guaranteed: 'border-dashed border-text-muted',
  none: 'border-rarity-5/60',
}
const SIZE = { sm: 'size-5!', md: 'size-7!', lg: 'size-[30px]!' } as const
const FRAME = { sm: 'border', md: 'border-2', lg: 'border-2' } as const
</script>

<template>
  <span
    class="inline-flex shrink-0 rounded-full p-px"
    :class="[RING[outcome ?? 'none'], FRAME[size]]"
  >
    <GameIcon
      :src="wishIcon(item)"
      :name="item.name"
      :rarity="item.rank || undefined"
      size="xs"
      class="rounded-full!"
      :class="SIZE[size]"
    />
  </span>
</template>
