<script setup lang="ts">
import { Lock } from 'lucide-vue-next'
import { MAX_REFINEMENT, weaponTitle, type WeaponRow } from '@/data/weapons'
import { characterIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'

/**
 * One copy, or one stack of identical spare copies, of a weapon: "R5 · Lv.
 * 80" with the wearer's portrait, or "51× R1 · Lv. 1". The count always
 * leads, so it never reads as a count of R5s. Opens that copy's details.
 */
defineProps<{ row: WeaponRow }>()
defineEmits<{ open: [] }>()

function hide(event: Event) {
  ;(event.target as HTMLElement).style.display = 'none'
}
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-label="weaponTitle(row)"
    :title="weaponTitle(row)"
    class="relative z-10 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-2 text-sm whitespace-nowrap transition-colors hover:bg-surface-overlay"
    @click.stop="$emit('open')"
  >
    <span v-if="row.count > 1" class="tabular font-mono text-text-secondary"
      >{{ formatNumber(row.count) }}×</span
    >
    <span
      class="tabular font-mono"
      :class="row.refinement >= MAX_REFINEMENT ? 'font-semibold text-accent-text' : ''"
      >R{{ row.refinement }}</span
    >
    <span class="text-text-muted" aria-hidden="true">·</span>
    <span class="tabular font-mono"
      ><span class="text-text-secondary">Lv. </span>{{ row.level }}</span
    >
    <img
      v-if="row.location"
      :src="characterIcon(row.location)"
      alt=""
      loading="lazy"
      decoding="async"
      class="size-6 rounded-full bg-surface-sunken object-cover"
      @error="hide"
    />
    <Lock v-else-if="row.lock" class="size-3.5 text-text-muted" aria-hidden="true" />
  </button>
</template>
