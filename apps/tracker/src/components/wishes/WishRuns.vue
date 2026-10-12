<script setup lang="ts">
import { computed, ref } from 'vue'
import { wishItemInfo } from '@gdt/shared'
import {
  PRIMOS_PER_PULL,
  currentRun,
  pityBand,
  type BannerRun,
  type BannerStats,
  type PullRow,
} from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import WishPortrait from './WishPortrait.vue'
import { BAND_COLOR, OUTCOME_LABEL, oddsOf, runDates, wishMinute } from './wish-labels'

/**
 * The banner runs the account pulled on, newest first: name and dates, the
 * pulls (a bar against the busiest run) and each 5★ as a chip ringed by its
 * 50/50. The run open now is marked. Four until "All runs".
 */
const props = defineProps<{ stats: BannerStats }>()

const FEW = 4
const all = ref(false)
const runs = computed(() => [...props.stats.runs].reverse())
const shown = computed(() => (all.value ? runs.value : runs.value.slice(0, FEW)))
const most = computed(() => Math.max(1, ...runs.value.map((r) => r.pulls)))
const open = computed(() => currentRun(props.stats.runs, Date.now() / 1000))

function name(run: BannerRun): string {
  const b = run.banner
  if (props.stats.banner === 302) {
    return b.featured5.map((key) => wishItemInfo('weapon', key)?.name ?? key).join(' / ')
  }
  return b.name400 ? `${b.name} / ${b.name400}` : b.name || b.version
}
const title = (run: BannerRun) =>
  `${name(run)}\n${run.banner.version} · ${runDates(run, false)}\n` +
  `${formatNumber(run.pulls)} pulls · ✦ ${formatNumber(run.pulls * PRIMOS_PER_PULL)}`
const chipTitle = (row: PullRow) =>
  [
    `${row.pull.item.name} · pity ${row.pity}`,
    row.outcome ? `${OUTCOME_LABEL[row.outcome]} (${oddsOf(props.stats.banner)})` : '',
    wishMinute(row.pull.time),
  ]
    .filter(Boolean)
    .join('\n')
const EDGE = {
  won: 'border-rarity-5/60',
  lost: 'border-danger-text',
  guaranteed: 'border-dashed border-text-muted',
  none: 'border-rarity-5/60',
} as const
</script>

<template>
  <section
    aria-label="Banner runs"
    class="min-w-0 rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <div class="flex items-center gap-3 border-b border-border-default px-4 py-3 sm:px-5">
      <h2 class="flex min-h-10 items-center text-base font-semibold">Banners</h2>
      <span class="tabular font-mono text-xs text-text-muted"
        >{{ formatNumber(runs.length) }} {{ runs.length === 1 ? 'run' : 'runs' }}</span
      >
      <button
        v-if="runs.length > FEW"
        type="button"
        class="ml-auto min-h-10 rounded-lg px-2 text-xs text-accent-text hover:bg-surface-overlay"
        :aria-expanded="all"
        @click="all = !all"
      >
        {{ all ? 'Fewer' : 'All runs' }}
      </button>
    </div>
    <ul class="py-1.5">
      <li
        v-for="run in shown"
        :key="run.banner.start + run.banner.name"
        class="grid grid-cols-1 items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,3fr)]"
        :class="run === open ? 'bg-accent/8 shadow-[inset_3px_0_0_var(--accent)]' : ''"
      >
        <div class="flex min-w-0 flex-col" :title="title(run)">
          <span class="truncate text-sm font-medium">{{ name(run) }}</span>
          <span class="tabular truncate font-mono text-xs text-text-muted"
            >{{ runDates(run, run === open) }}{{ run === open ? ' · current' : '' }}</span
          >
        </div>
        <div class="flex min-w-0 flex-col gap-1.5">
          <span class="tabular text-right font-mono text-sm">{{ formatNumber(run.pulls) }}</span>
          <span class="h-1.5 rounded-full bg-surface-sunken" aria-hidden="true">
            <span
              class="block h-full rounded-full bg-chart-1"
              :style="{ width: `${(run.pulls / most) * 100}%` }"
            />
          </span>
        </div>
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <span
            v-for="row in [...run.fives].reverse()"
            :key="row.pull.id.toString()"
            class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-xs"
            :class="EDGE[row.outcome ?? 'none']"
            :title="chipTitle(row)"
          >
            <WishPortrait :item="row.pull.item" size="sm" class="border-0! p-0!" />
            <span class="truncate">{{ row.pull.item.name }}</span>
            <span
              class="tabular shrink-0 font-mono font-semibold"
              :style="{ color: BAND_COLOR[pityBand(row.pity, stats.banner)] }"
              >{{ row.pity }}</span
            >
          </span>
          <span v-if="!run.fives.length" class="text-xs text-text-muted">No 5★</span>
        </div>
      </li>
    </ul>
  </section>
</template>
