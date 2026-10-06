<script setup lang="ts">
import { computed } from 'vue'
import { Lock, Sparkle } from 'lucide-vue-next'
import ItemTile from '@/components/ui/ItemTile.vue'
import { artifactLabel, type ArtifactRow } from '@/data/artifacts'
import { artifactIcon, characterIcon } from '@/lib/assets'
import { CRIT_TIER_TEXT, cvTier, isCritCirclet } from '@/lib/crit-tiers'
import { formatStatTile } from '@/utils/artifact-stats'

/**
 * One artifact in a bag grid, as the game draws it: level top-left (a dot
 * when it is new), the wearer top-right, lock and astral mark bottom-left;
 * the main stat and CV along the foot (in its tier colour for 5★, plain
 * below: the tiers are 5★ scales). Words in the tooltip.
 */
const props = defineProps<{ row: ArtifactRow; isNew?: boolean }>()
defineEmits<{ open: [] }>()

const a = computed(() => props.row.artifact)
const cvClass = computed(() =>
  a.value.rarity < 5
    ? 'text-text-secondary'
    : CRIT_TIER_TEXT[
        cvTier(props.row.cv, 'artifact', isCritCirclet(a.value.slotKey, a.value.mainStatKey))
      ],
)
const CHIP = 'flex h-5 items-center rounded-md bg-surface-raised/90 shadow-sm'

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
    @open="$emit('open')"
  >
    <template #top-left>
      <span
        :class="[
          CHIP,
          'tabular gap-1 px-1 font-mono text-xs',
          row.maxed ? '' : 'text-text-secondary',
        ]"
        ><span v-if="isNew" class="size-1.5 rounded-full bg-accent" />+{{ a.level }}</span
      >
    </template>
    <template v-if="a.location" #top-right>
      <img
        :src="characterIcon(a.location)"
        alt=""
        loading="lazy"
        decoding="async"
        class="size-6 rounded-full bg-surface-sunken object-cover ring-2 ring-surface-raised"
        @error="hide"
      />
    </template>
    <template v-if="a.lock || a.astralMark" #bottom-left>
      <span :class="CHIP" class="gap-0.5 px-0.5">
        <Lock v-if="a.lock" class="size-3 text-text-secondary" />
        <Sparkle v-if="a.astralMark" class="size-3 fill-current text-rarity-5" />
      </span>
    </template>
    <template #footer>
      <span class="text-text-secondary">{{ formatStatTile(a.mainStatKey) }}</span>
    </template>
    <template #footer-end>
      <span class="tabular shrink-0 font-mono" :class="cvClass">{{ row.cv.toFixed(1) }}</span>
    </template>
  </ItemTile>
</template>
