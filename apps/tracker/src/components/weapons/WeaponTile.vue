<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import ItemTile from '@/components/ui/ItemTile.vue'
import { TILE_AVATAR, TILE_CHIP, TILE_CHIP_ICON, TILE_LOCK } from '@/components/ui/item-tile'
import { weaponTitle, type WeaponRow } from '@/data/weapons'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * One copy in the Bag, as the game draws it: refinement top-left, the lock
 * under it, the wearer's portrait over the top-right corner, "Lv. 90" on the
 * strip and "×57" for a stack of identical spare copies (the level's cap is
 * in the tooltip).
 */
defineProps<{ row: WeaponRow; selected?: boolean }>()
defineEmits<{ open: [] }>()

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
      <span :class="TILE_CHIP" class="tabular">{{ row.refinement }}</span>
      <span v-if="row.lock" :class="TILE_CHIP"
        ><Lock :class="[TILE_CHIP_ICON, TILE_LOCK]" stroke-width="2.6"
      /></span>
    </template>
    <template v-if="row.location" #top-right>
      <img
        :src="characterIcon(row.location)"
        alt=""
        loading="lazy"
        decoding="async"
        :class="TILE_AVATAR"
        @error="hide"
      />
    </template>
    <template #footer>Lv. {{ row.level }}</template>
    <template v-if="row.count > 1" #footer-end>
      <span class="tabular shrink-0">×{{ formatNumber(row.count) }}</span>
    </template>
  </ItemTile>
</template>
