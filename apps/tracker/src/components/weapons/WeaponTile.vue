<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import ItemTile from '@/components/ui/ItemTile.vue'
import LevelText from '@/components/ui/LevelText.vue'
import { MAX_REFINEMENT, weaponTitle, type WeaponRow } from '@/data/weapons'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * One copy in the Bag, as the game draws it: refinement top-left (R5 in the
 * accent), the lock under it, the wearer's portrait top-right, the level at
 * the foot and "×57" for a stack of identical spare copies.
 */
defineProps<{ row: WeaponRow; selected?: boolean }>()
defineEmits<{ open: [] }>()

const CHIP = 'grid h-5 min-w-5 place-items-center rounded-md bg-surface-raised/90 shadow-sm'

function hide(event: Event) {
  ;(event.target as HTMLElement).style.visibility = 'hidden'
}
</script>

<template>
  <ItemTile
    :src="weaponIcon(row.key, row.ascension)"
    :name="row.name"
    :rarity="row.rarity"
    :label="weaponTitle(row)"
    :selected="selected"
    stars
    @open="$emit('open')"
  >
    <template #top-left>
      <span
        :class="[
          CHIP,
          'tabular px-1 font-mono text-xs font-semibold',
          row.refinement >= MAX_REFINEMENT ? 'text-accent-text' : 'text-text-primary',
        ]"
        >{{ row.refinement }}</span
      >
      <span v-if="row.lock" :class="CHIP"><Lock class="size-3 text-text-secondary" /></span>
    </template>
    <template v-if="row.location" #top-right>
      <img
        :src="characterIcon(row.location)"
        alt=""
        loading="lazy"
        decoding="async"
        class="size-6 rounded-full bg-surface-sunken object-cover ring-2 ring-surface-raised"
        @error="hide"
      />
    </template>
    <template #footer>
      <LevelText :level="row.level" :ascension="row.ascension" bare />
    </template>
    <template v-if="row.count > 1" #footer-end>
      <span class="tabular shrink-0 font-mono text-text-secondary"
        >×{{ formatNumber(row.count) }}</span
      >
    </template>
  </ItemTile>
</template>
