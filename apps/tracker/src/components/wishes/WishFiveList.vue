<script setup lang="ts">
import type { UigfGachaType } from '@gdt/shared'
import { HARD_PITY, type PullRow } from '@/data/wish-history'
import { OUTCOME_LABEL, outcomeTitle, pityColor, runName, wishMinute } from './wish-labels'

/**
 * Every 5★ as paimon.moe lists them: "Name pity" in a small rounded pill,
 * newest first, in a box that scrolls on its own past a few rows. The pity
 * runs green to red; the edge is gold for a won (or plain) 5★, red for a
 * lost 50/50 and grey for a guaranteed one. When, which banner and the
 * result are in the tooltip.
 */
const props = defineProps<{ rows: readonly PullRow[]; banner: UigfGachaType }>()

const EDGE = {
  won: 'border-rarity-5/70',
  lost: 'border-danger-border',
  guaranteed: 'border-border-strong',
} as const

function title(row: PullRow): string {
  return [
    `${row.pull.item.name} · pity ${row.pity}`,
    wishMinute(row.pull.time),
    runName(row),
    row.outcome ? `${OUTCOME_LABEL[row.outcome]}: ${outcomeTitle(row.outcome, props.banner)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
</script>

<template>
  <ul
    class="flex max-h-44 flex-wrap content-start gap-1 overflow-y-auto rounded-lg bg-surface-sunken p-2"
    aria-label="5★ pulls, newest first"
  >
    <li
      v-for="row in rows"
      :key="row.pull.id.toString()"
      class="rounded-full border px-2 text-sm leading-6 whitespace-nowrap text-text-secondary"
      :class="EDGE[row.outcome ?? 'won']"
      :title="title(row)"
    >
      {{ row.pull.item.name
      }}<span
        class="tabular pl-1 font-mono font-semibold"
        :style="{ color: pityColor(row.pity, HARD_PITY[banner][0]) }"
        >{{ row.pity }}</span
      >
    </li>
  </ul>
</template>
