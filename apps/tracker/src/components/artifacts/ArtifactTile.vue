<script setup lang="ts">
import { computed } from 'vue'
import { Lock, Sparkle } from 'lucide-vue-next'
import ItemTile from '@/components/ui/ItemTile.vue'
import { TILE_AVATAR, TILE_CHIP, TILE_CHIP_ICON, TILE_LOCK } from '@/components/ui/item-tile'
import { artifactLabel, type ArtifactRow } from '@/data/artifacts'
import { artifactIcon, characterIcon } from '@/lib/assets'
import { CRIT_TIER_TEXT, cvTier, isCritCirclet } from '@/lib/crit-tiers'

/**
 * One artifact in a bag grid, as the game draws it: the lock top-left with
 * the astral mark under it, the wearer over the top-right corner, its stars,
 * "+20" on the strip (a dot before it when it is new) and the CV at the
 * strip's end (in its tier colour for 5★, plain below: the tiers are 5★
 * scales). Words, the main stat among them, in the tooltip.
 */
const props = defineProps<{ row: ArtifactRow; isNew?: boolean }>()
defineEmits<{ open: [] }>()

const a = computed(() => props.row.artifact)
const cvClass = computed(() =>
  a.value.rarity < 5
    ? 'text-text-muted'
    : CRIT_TIER_TEXT[
        cvTier(props.row.cv, 'artifact', isCritCirclet(a.value.slotKey, a.value.mainStatKey))
      ],
)
function hide(event: Event) {
  ;(event.target as HTMLElement).style.visibility = 'hidden'
}
</script>

<template>
  <ItemTile
    :src="artifactIcon(a.setKey, a.slotKey)"
    :name="row.setName"
    :rarity="a.rarity"
    :label="artifactLabel(row, isNew)"
    stars
    @open="$emit('open')"
  >
    <template v-if="a.lock || a.astralMark" #top-left>
      <span v-if="a.lock" :class="TILE_CHIP"
        ><Lock :class="[TILE_CHIP_ICON, TILE_LOCK]" stroke-width="2.6"
      /></span>
      <span v-if="a.astralMark" :class="TILE_CHIP"
        ><Sparkle :class="TILE_CHIP_ICON" class="fill-current text-[#ffcc32]"
      /></span>
    </template>
    <template v-if="a.location" #top-right>
      <img
        :src="characterIcon(a.location)"
        alt=""
        loading="lazy"
        decoding="async"
        :class="TILE_AVATAR"
        @error="hide"
      />
    </template>
    <template #footer>
      <span class="inline-flex items-center gap-[2cqw]"
        ><span v-if="isNew" class="size-[5cqw] rounded-full bg-accent" />+{{ a.level }}</span
      >
    </template>
    <template #footer-end>
      <span class="tabular shrink-0" :class="cvClass">{{ row.cv.toFixed(1) }}</span>
    </template>
  </ItemTile>
</template>
