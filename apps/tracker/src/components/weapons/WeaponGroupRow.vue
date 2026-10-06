<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import { RARITY_TEXT } from '@/components/characters/tokens'
import { WEAPON_TYPE_LABELS, weaponTitle, type WeaponGroup } from '@/data/weapons'
import { weaponIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import RefineBadge from './RefineBadge.vue'
import WeaponCopyChip from './WeaponCopyChip.vue'

/**
 * One weapon with its copies as chips: equipped copies first (with the
 * wearer), then stacks of spare copies by level and refinement, at most
 * `limit` before "+N". The total is a muted number at the end, never next
 * to an "R". The row opens the weapon; a chip opens that copy.
 */
const props = withDefaults(defineProps<{ group: WeaponGroup; limit?: number }>(), { limit: 4 })
const emit = defineEmits<{ open: [rowId: string | null] }>()

const g = computed(() => props.group)
const shown = computed(() => g.value.rows.slice(0, props.limit))
const hidden = computed(() => g.value.rows.slice(props.limit))
const hiddenTitle = computed(() => hidden.value.map(weaponTitle).join('\n'))
const copies = computed(
  () => `${formatNumber(g.value.count)} ${g.value.count === 1 ? 'copy' : 'copies'}`,
)
const kind = computed(() =>
  [g.value.rarity ? `${g.value.rarity}★` : '', g.value.type ? WEAPON_TYPE_LABELS[g.value.type] : '']
    .filter(Boolean)
    .join(' '),
)
</script>

<template>
  <div
    class="relative flex flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:gap-3"
  >
    <button
      type="button"
      class="absolute inset-0 rounded-xl"
      aria-haspopup="dialog"
      :aria-label="`${g.name}, ${copies}`"
      @click="emit('open', null)"
    />
    <div class="flex min-w-0 items-center gap-3 sm:w-64 sm:shrink-0">
      <GameIcon
        :src="weaponIcon(g.key, g.best.ascension)"
        :name="g.name"
        :rarity="g.rarity ?? undefined"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium" :title="g.name">{{ g.name }}</p>
        <p class="flex items-center gap-1.5 text-xs text-text-muted">
          <span v-if="g.rarity" :class="RARITY_TEXT[g.rarity]" aria-hidden="true">{{
            '★'.repeat(g.rarity)
          }}</span>
          <span class="sr-only">{{ kind }}</span>
          <span v-if="g.type" aria-hidden="true">{{ WEAPON_TYPE_LABELS[g.type] }}</span>
        </p>
      </div>
      <span v-if="g.refine" class="relative z-10 shrink-0 sm:hidden">
        <RefineBadge :refine="g.refine" />
      </span>
    </div>

    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <WeaponCopyChip v-for="row in shown" :key="row.id" :row="row" @open="emit('open', row.id)" />
      <span
        v-if="hidden.length"
        class="tabular relative z-10 font-mono text-sm text-text-muted"
        :title="hiddenTitle"
        >+{{ hidden.length }}</span
      >
      <span
        class="tabular relative z-10 ml-auto pl-1 font-mono text-sm text-text-muted"
        :title="copies"
        ><span aria-hidden="true">{{ formatNumber(g.count) }}</span
        ><span class="sr-only">{{ copies }}</span></span
      >
    </div>
    <span v-if="g.refine" class="relative z-10 hidden shrink-0 sm:block">
      <RefineBadge :refine="g.refine" />
    </span>
  </div>
</template>
