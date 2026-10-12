<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UigfGachaType } from '@gdt/shared'
import type { PullRow } from '@/data/wish-history'
import GameIcon from '@/components/ui/GameIcon.vue'
import { OUTCOME_LABEL, outcomeTitle, pityTone, runName, wishIcon, wishMinute } from './wish-labels'

/**
 * Every 5★ as a chip, oldest first like paimon.moe's: portrait, name and
 * the pity it took (coloured from early green to late red). A lost 50/50
 * has a red edge, a guaranteed one a dashed edge; the banner it came from
 * and when are in the tooltip. With `limit`, the newest that many until
 * "Show all".
 */
const props = defineProps<{
  rows: readonly PullRow[]
  banner: UigfGachaType
  soft: number
  limit?: number
}>()
const open = ref(false)
const hidden = computed(() =>
  props.limit && !open.value ? Math.max(0, props.rows.length - props.limit) : 0,
)
const shown = computed(() => props.rows.slice(0, props.rows.length - hidden.value).reverse())

function title(row: PullRow, banner: UigfGachaType): string {
  return [
    `${row.pull.item.name} · pity ${row.pity}`,
    wishMinute(row.pull.time),
    runName(row),
    row.outcome ? `${OUTCOME_LABEL[row.outcome]}: ${outcomeTitle(row.outcome, banner)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
</script>

<template>
  <ul class="flex flex-wrap gap-1.5" aria-label="5★ pulls">
    <li v-if="hidden > 0 || (open && limit)">
      <button
        type="button"
        class="tabular flex h-full items-center rounded-lg border border-border-default px-2 font-mono text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        :title="open ? 'Show the newest only' : `Show all ${rows.length}`"
        @click="open = !open"
      >
        {{ open ? '−' : `+${hidden}` }}
      </button>
    </li>
    <li
      v-for="row in shown"
      :key="row.pull.id.toString()"
      class="flex items-center gap-1.5 rounded-lg border py-0.5 pr-2 pl-0.5 text-sm"
      :class="
        row.outcome === 'lost'
          ? 'border-danger-border bg-danger-surface'
          : row.outcome === 'guaranteed'
            ? 'border-dashed border-border-strong bg-surface-overlay'
            : 'border-border-default bg-surface-overlay'
      "
      :title="title(row, banner)"
    >
      <GameIcon :src="wishIcon(row.pull.item)" :name="row.pull.item.name" :rarity="5" size="xs" />
      <span class="max-w-32 truncate">{{ row.pull.item.name }}</span>
      <span class="tabular font-mono font-medium" :class="pityTone(row.pity, soft)">{{
        row.pity
      }}</span>
    </li>
  </ul>
</template>
