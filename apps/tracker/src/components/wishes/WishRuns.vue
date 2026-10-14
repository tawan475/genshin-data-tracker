<script setup lang="ts">
import { wishItemName } from './item-name'
import { gameName } from '@/i18n/game-names'
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
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import WishItemIcon from './WishItemIcon.vue'
import { BAND_COLOR, oddsOf, outcomeLabel, runDates, wishMinute } from './wish-labels'

/**
 * The banner runs the account pulled on, newest first: name and dates, the
 * pulls and each 5★ as a chip, its icon ringed by the 50/50. The run open
 * now is marked. Four until "All runs".
 */
const props = defineProps<{ stats: BannerStats }>()

const FEW = 4
const all = ref(false)
const runs = computed(() => [...props.stats.runs].reverse())
const shown = computed(() => (all.value ? runs.value : runs.value.slice(0, FEW)))
const open = computed(() => currentRun(props.stats.runs, Date.now() / 1000))

function name(run: BannerRun): string {
  const b = run.banner
  if (props.stats.banner === 302) {
    return b.featured5
      .map((key) => gameName('weapons', key, wishItemInfo('weapon', key)?.name ?? key))
      .join(' / ')
  }
  return b.name400 ? `${b.name} / ${b.name400}` : b.name || b.version
}
const pullsLine = (run: BannerRun) =>
  t('wishes.pullsPrimos', {
    n: formatNumber(run.pulls),
    primos: formatNumber(run.pulls * PRIMOS_PER_PULL),
  })
const title = (run: BannerRun) =>
  `${name(run)}\n${run.banner.version} · ${runDates(run, false)}\n${pullsLine(run)}`
const chipTitle = (row: PullRow) =>
  [
    t('wishes.five.pity', { name: wishItemName(row.pull.item), pity: row.pity }),
    row.outcome
      ? t('wishes.five.outcome', {
          outcome: outcomeLabel(row.outcome),
          odds: oddsOf(props.stats.banner),
        })
      : '',
    wishMinute(row.pull.time),
  ]
    .filter(Boolean)
    .join('\n')
</script>

<template>
  <section
    :aria-label="$t('wishes.runs.label')"
    class="min-w-0 rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <div class="flex items-center gap-3 border-b border-border-default px-4 py-3 sm:px-5">
      <h2 class="flex min-h-10 items-center text-base font-semibold">
        {{ $t('wishes.runs.heading') }}
      </h2>
      <span class="tabular font-mono text-xs text-text-muted">{{
        $t('wishes.runs.count', { n: formatNumber(runs.length) }, runs.length)
      }}</span>
      <button
        v-if="runs.length > FEW"
        type="button"
        class="ml-auto min-h-10 rounded-lg px-2 text-xs text-accent-text hover:bg-surface-overlay"
        :aria-expanded="all"
        @click="all = !all"
      >
        {{ all ? $t('wishes.runs.fewer') : $t('wishes.runs.all') }}
      </button>
    </div>
    <ul class="py-1">
      <li
        v-for="(run, i) in shown"
        :key="run.banner.start + run.banner.name"
        class="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 sm:px-5"
        :class="[
          run === open ? 'bg-accent/8 shadow-[inset_3px_0_0_var(--accent)]' : '',
          i > 0 && run !== open ? 'border-t border-border-default' : '',
        ]"
      >
        <div class="flex min-w-0 flex-[1_1_300px] flex-col" :title="title(run)">
          <span class="truncate text-sm font-medium">{{ name(run) }}</span>
          <span class="tabular truncate font-mono text-xs text-text-muted"
            >{{ runDates(run, run === open)
            }}{{ run === open ? $t('wishes.runs.current') : '' }}</span
          >
        </div>
        <span
          class="tabular w-[4.5rem] shrink-0 text-right font-mono text-sm"
          :title="pullsLine(run)"
          >{{ formatNumber(run.pulls) }}</span
        >
        <div class="flex min-w-0 flex-[999_1_420px] flex-wrap gap-1.5">
          <span
            v-for="row in [...run.fives].reverse()"
            :key="row.pull.id.toString()"
            class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-surface-sunken py-0.5 pr-2.5 pl-0.5 text-xs"
            :title="chipTitle(row)"
          >
            <WishItemIcon :item="row.pull.item" :outcome="row.outcome" size="sm" />
            <span class="truncate">{{ wishItemName(row.pull.item) }}</span>
            <span
              class="tabular shrink-0 font-mono font-bold"
              :style="{ color: BAND_COLOR[pityBand(row.pity, stats.banner)] }"
              >{{ row.pity }}</span
            >
          </span>
          <span v-if="!run.fives.length" class="text-xs text-text-muted">{{
            $t('wishes.runs.no5')
          }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>
