<script setup lang="ts">
import { wishItemName } from './item-name'
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { HARD_PITY, pityBand, type BannerStats, type PullRow } from '@/data/wish-history'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import WishItemIcon from './WishItemIcon.vue'
import { BAND_COLOR, bannerInfo, formatPercent, formatPity, wishMinute } from './wish-labels'

/**
 * A banner without a 50/50 (Standard, Chronicled, Beginners') on the
 * overview: 5★ and 4★ counts with rate and average pity (the pity so far
 * while it has no 5★), and its 5★ as small chips, newest first.
 */
const props = defineProps<{ stats: BannerStats; to: RouteLocationRaw }>()
const info = computed(() => bannerInfo(props.stats.banner))
const avg = (n: number) => formatPity(Math.round(n * 10) / 10)
const fiveSub = computed(() =>
  props.stats.five.count
    ? t('wishes.numbers.avgPity', {
        share: formatPercent(props.stats.five.share),
        avg: avg(props.stats.five.avgPity),
      })
    : t('wishes.small.pitySoFar', {
        pity: props.stats.pity5,
        hard: HARD_PITY[props.stats.banner][0],
      }),
)
const fourSub = computed(() =>
  props.stats.four.count
    ? t('wishes.numbers.avgPity', {
        share: formatPercent(props.stats.four.share),
        avg: avg(props.stats.four.avgPity),
      })
    : t('wishes.small.pitySoFar', {
        pity: props.stats.pity4,
        hard: HARD_PITY[props.stats.banner][1],
      }),
)
const color = (row: PullRow) => BAND_COLOR[pityBand(row.pity, props.stats.banner)]
</script>

<template>
  <section
    :aria-label="info.title"
    class="flex min-w-0 flex-col gap-3 rounded-xl border border-border-default bg-surface-raised px-4 pt-3.5 pb-4 shadow-sm sm:px-5"
  >
    <div class="flex min-w-0 items-center gap-2.5">
      <h2 class="min-w-0 truncate text-base font-semibold">
        <RouterLink :to="to" class="hover:underline">{{ info.title }}</RouterLink>
      </h2>
      <span class="tabular shrink-0 font-mono text-xs text-text-muted">{{
        $t('wishes.pulls', { n: formatNumber(stats.total) })
      }}</span>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold text-rarity-5">5★</span>
        <span class="tabular font-mono text-xl font-bold">{{
          formatNumber(stats.five.count)
        }}</span>
        <span class="tabular truncate font-mono text-xs text-text-muted">{{ fiveSub }}</span>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold text-rarity-4">4★</span>
        <span class="tabular font-mono text-xl font-bold">{{
          formatNumber(stats.four.count)
        }}</span>
        <span class="tabular truncate font-mono text-xs text-text-muted">{{ fourSub }}</span>
      </div>
    </div>
    <ul v-if="stats.fives.length" class="flex max-h-[8.5rem] flex-wrap gap-2 overflow-y-auto">
      <li
        v-for="row in stats.fives"
        :key="row.pull.id.toString()"
        class="inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg bg-surface-sunken py-1 pr-2.5 pl-1"
        :title="`${$t('wishes.five.pity', { name: wishItemName(row.pull.item), pity: row.pity })}\n${wishMinute(row.pull.time)}`"
      >
        <WishItemIcon :item="row.pull.item" size="sm" />
        <span class="truncate text-sm font-medium">{{ wishItemName(row.pull.item) }}</span>
        <span class="tabular shrink-0 font-mono text-sm font-bold" :style="{ color: color(row) }">{{
          row.pity
        }}</span>
      </li>
    </ul>
    <p v-else class="text-xs text-text-muted">{{ $t('wishes.five.none') }}</p>
  </section>
</template>
