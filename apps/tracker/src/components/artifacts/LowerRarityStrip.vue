<script setup lang="ts">
import { computed, useId, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import { useProgressive } from '@/components/planner/use-progressive'
import { RARITY_TEXT } from '@/components/characters/tokens'
import { isNewPiece, type ArtifactRow } from '@/data/artifacts'
import { formatNumber } from '@/lib/format'
import ArtifactTile from './ArtifactTile.vue'

/**
 * Below-5★ pieces, which a CV, RV or Potential sort puts last: one line
 * ("4★ 42 · 3★ 86 ▸") that opens a compact tile grid of them, in the
 * current order. The caller remembers whether it is open.
 */
const props = defineProps<{ rows: ArtifactRow[]; previous: ReadonlySet<number> | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ pick: [id: number] }>()

const panelId = useId()
const counts = computed(() => {
  const byRarity = new Map<number, number>()
  for (const row of props.rows) {
    byRarity.set(row.artifact.rarity, (byRarity.get(row.artifact.rarity) ?? 0) + 1)
  }
  return [...byRarity].sort((a, b) => b[0] - a[0])
})
const label = computed(() => counts.value.map(([r, n]) => `${r}★ ${n}`).join(', '))

const total = computed(() => (open.value ? props.rows.length : 0))
const { shown, restart } = useProgressive(total, 48, 48)
watch(() => props.rows, restart)
</script>

<template>
  <div class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <button
      type="button"
      class="flex min-h-11 w-full items-center gap-3 px-3 text-sm"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="`Lower rarities: ${label}`"
      title="Lower rarities, which this sort puts last"
      @click="open = !open"
    >
      <template v-for="([rarity, count], index) in counts" :key="rarity">
        <span v-if="index" class="text-text-muted" aria-hidden="true">·</span>
        <span class="inline-flex items-center gap-1.5">
          <span class="font-medium" :class="RARITY_TEXT[rarity]">{{ rarity }}★</span>
          <span class="tabular font-mono text-text-secondary">{{ formatNumber(count) }}</span>
        </span>
      </template>
      <ChevronRight
        class="ml-auto size-4 shrink-0 text-text-muted transition-transform"
        :class="open ? 'rotate-90' : ''"
        aria-hidden="true"
      />
    </button>
    <ul
      v-if="open"
      :id="panelId"
      class="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2 border-t border-border-subtle p-3"
    >
      <li v-for="row in rows.slice(0, shown)" :key="row.id" class="flex">
        <ArtifactTile :row="row" :is-new="isNewPiece(row, previous)" @open="emit('pick', row.id)" />
      </li>
    </ul>
  </div>
</template>
