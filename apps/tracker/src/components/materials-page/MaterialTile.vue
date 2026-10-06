<script setup lang="ts">
import ItemTile from '@/components/ui/ItemTile.vue'
import { formatCompact, formatSigned } from '@/lib/format'

/**
 * One material in the bag, as the game draws it: the picture on its
 * rarity's colour, the count along the foot (in the accent when set by hand
 * on the Planner). Over the picture: the change in the period (top right)
 * and a dot when it is tracked (top left). Dimmed at 0. Words in `label`.
 */
defineProps<{
  name: string
  src: string
  /** null where the game data has none (only planner materials carry one). */
  rarity: number | null
  /** The count shown (the hand-set one where the Planner has one). */
  count: number
  change: number
  tracked: boolean
  edited: boolean
  label: string
}>()
defineEmits<{ open: [event: MouseEvent] }>()
</script>

<template>
  <ItemTile
    :src="src"
    :name="name"
    :rarity="rarity"
    :label="label"
    :class="count === 0 ? 'opacity-50 grayscale' : ''"
    @open="$emit('open', $event)"
  >
    <template v-if="tracked" #top-left>
      <span class="size-2 rounded-full bg-accent ring-2 ring-surface-raised" />
    </template>
    <template v-if="change" #top-right>
      <span
        class="tabular rounded bg-surface-raised/90 px-1 font-mono text-[0.6875rem] leading-4 font-semibold shadow-sm"
        :class="change > 0 ? 'text-success-text' : 'text-danger-text'"
        >{{ formatSigned(change) }}</span
      >
    </template>
    <template #footer>
      <span
        class="tabular block text-center font-mono font-semibold"
        :class="edited ? 'text-accent-text' : ''"
        >{{ formatCompact(count) }}</span
      >
    </template>
  </ItemTile>
</template>
