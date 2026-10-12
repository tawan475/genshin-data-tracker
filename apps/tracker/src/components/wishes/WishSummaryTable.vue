<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import {
  EXPECTED_PITY,
  type BannerStats,
  type RateLine,
  type RarityLine,
} from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { bannerInfo, formatPercent, formatPity, oddsOf } from './wish-labels'

/**
 * paimon.moe's numbers for a banner: 5★ and 4★ (4★ split into characters
 * and weapons) with their share of all pulls and average pity, and the
 * 50/50s won (75/25 for the weapon banner's 5★; won of won + lost,
 * guaranteed ones left out). Streaks and the expected average are tooltips.
 */
const props = defineProps<{ stats: BannerStats; to?: RouteLocationRaw }>()
const info = computed(() => bannerInfo(props.stats.banner))

interface Row {
  label: string
  sub: boolean
  rank: 4 | 5
  total: number
  rate: string
  avg: string
  title?: string
}

const lineRow = (label: string, line: RarityLine, rank: 4 | 5, sub = false): Row => ({
  label,
  sub,
  rank,
  total: line.count,
  rate: formatPercent(line.share),
  avg: line.count ? formatPity(Math.round(line.avgPity * 100) / 100) : '—',
})
const rateRow = (rate: RateLine, rank: 4 | 5, odds: string): Row => ({
  label: `Won ${odds}`,
  sub: true,
  rank,
  total: rate.won,
  rate: rate.rate === null ? '—' : formatPercent(rate.rate),
  avg: '',
  title:
    `Won ${formatNumber(rate.won)} · lost ${formatNumber(rate.lost)} (guaranteed ones left out)\n` +
    `${rate.winStreak > 0 ? `Won ${rate.winStreak}` : `Lost ${rate.loseStreak}`} in a row now · ` +
    `longest: won ${rate.maxWinStreak}, lost ${rate.maxLoseStreak}`,
})

const rows = computed<Row[]>(() => {
  const s = props.stats
  const five = lineRow('5★', s.five, 5)
  if (s.five.count) {
    const expected = EXPECTED_PITY[s.banner]
    const diff = s.five.avgPity - expected
    five.title = `Average 5★ pity, expected about ${expected} with soft pity: ${diff <= 0 ? 'luckier' : 'unluckier'} by ${formatPity(Math.round(Math.abs(diff) * 100) / 100)}`
  }
  const out = [five]
  if (s.rate5) out.push(rateRow(s.rate5, 5, oddsOf(s.banner)))
  out.push(lineRow('4★', s.four, 4))
  out.push(lineRow('Character', s.fourCharacter, 4, true))
  out.push(lineRow('Weapon', s.fourWeapon, 4, true))
  if (s.rate4) out.push(rateRow(s.rate4, 4, '50/50'))
  return out
})
</script>

<template>
  <section
    :aria-label="`${info.title} numbers`"
    class="flex min-w-0 flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <div class="flex items-center gap-3 border-b border-border-default px-4 py-3 sm:px-5">
      <h2 class="flex min-h-10 min-w-0 items-center truncate text-base font-semibold">
        <RouterLink v-if="to" :to="to" class="truncate hover:underline">{{
          info.title
        }}</RouterLink>
        <span v-else class="truncate">{{ info.title }}</span>
      </h2>
      <span
        class="tabular ml-auto shrink-0 font-mono text-xs text-text-muted"
        :title="`${formatNumber(stats.total)} pulls`"
        >{{ formatNumber(stats.total) }}</span
      >
    </div>
    <div class="overflow-x-auto">
      <table class="tabular w-full font-mono text-sm">
        <thead>
          <tr class="text-xs text-text-muted">
            <th scope="col" class="px-3 pt-2.5 pb-1.5 sm:px-5">
              <span class="sr-only">Rarity</span>
            </th>
            <th scope="col" class="px-2 pt-2.5 pb-1.5 text-right font-medium sm:px-3">Total</th>
            <th scope="col" class="px-2 pt-2.5 pb-1.5 text-right font-medium sm:px-3">Rate</th>
            <th
              scope="col"
              class="px-3 pt-2.5 pb-1.5 text-right font-medium whitespace-nowrap sm:px-5"
            >
              Avg pity
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.label + row.rank"
            class="border-t border-border-default"
            :title="row.title"
          >
            <th
              scope="row"
              class="py-2 pr-2 text-left whitespace-nowrap sm:pr-3"
              :class="[
                row.rank === 5 ? 'text-rarity-5' : 'text-rarity-4',
                row.sub ? 'pl-5 font-normal sm:pl-9' : 'pl-3 font-medium sm:pl-5',
              ]"
            >
              <span v-if="row.sub" aria-hidden="true">└ </span>{{ row.label }}
            </th>
            <td class="px-2 py-2 text-right sm:px-3">{{ formatNumber(row.total) }}</td>
            <td class="px-2 py-2 text-right sm:px-3">{{ row.rate }}</td>
            <td class="px-3 py-2 text-right sm:px-5">{{ row.avg }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
