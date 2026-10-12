<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import {
  EXPECTED_PITY,
  SOFT_PITY,
  type BannerStats,
  type RateLine,
  type RarityLine,
} from '@/data/wish-history'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatNumber } from '@/lib/format'
import WishFiveChips from './WishFiveChips.vue'
import { bannerInfo, formatPercent, formatPity, oddsOf } from './wish-labels'

/**
 * paimon.moe's summary of a banner: 5★ and 4★ (4★ split into characters and
 * weapons) with their share of all pulls and average pity, the 50/50s won
 * (75/25 on the weapon banner; won of won + lost, guaranteed ones left out),
 * then every 5★ as a chip. Streaks and the expected average are tooltips.
 */
const props = defineProps<{ stats: BannerStats; to?: RouteLocationRaw }>()
const info = computed(() => bannerInfo(props.stats.banner))
const expected = computed(() => EXPECTED_PITY[props.stats.banner])

interface Row {
  label: string
  sub?: boolean
  rank: 4 | 5
  count: number
  share: string
  pity: string
  title?: string
  pityTitle?: string
}

const rateRow = (rate: RateLine, rank: 4 | 5, odds: string): Row => ({
  label: `Won ${odds}`,
  sub: true,
  rank,
  count: rate.won,
  share: rate.rate === null ? '—' : formatPercent(rate.rate),
  pity: '',
  title:
    `Won ${formatNumber(rate.won)} · lost ${formatNumber(rate.lost)} (guaranteed ones not counted) · ` +
    `${rate.winStreak > 0 ? `won ${rate.winStreak}` : `lost ${rate.loseStreak}`} in a row now · ` +
    `longest: won ${rate.maxWinStreak}, lost ${rate.maxLoseStreak}`,
})
const lineRow = (label: string, line: RarityLine, rank: 4 | 5, sub = false): Row => ({
  label,
  sub,
  rank,
  count: line.count,
  share: formatPercent(line.share),
  pity: line.count ? formatPity(line.avgPity) : '—',
})

const rows = computed<Row[]>(() => {
  const s = props.stats
  const out: Row[] = []
  const five = lineRow('5★', s.five, 5)
  if (s.five.count) {
    const diff = s.five.avgPity - expected.value
    five.pityTitle = `Expected about ${expected.value} with soft pity: ${diff <= 0 ? 'luckier' : 'unluckier'} by ${formatPity(Math.abs(diff))}`
  }
  out.push(five)
  if (s.rate5) out.push(rateRow(s.rate5, 5, oddsOf(s.banner)))
  out.push(lineRow('4★', s.four, 4))
  out.push(lineRow('Character', s.fourCharacter, 4, true))
  out.push(lineRow('Weapon', s.fourWeapon, 4, true))
  if (s.rate4) out.push(rateRow(s.rate4, 4, '50/50'))
  return out
})
</script>

<template>
  <UiPanel flush>
    <template #header>
      <h2 class="text-base font-semibold">
        <RouterLink v-if="to" :to="to" class="hover:underline">{{ info.title }}</RouterLink>
        <span v-else>{{ info.title }}</span>
      </h2>
    </template>
    <template #actions>
      <span class="tabular font-mono text-sm text-text-muted" title="Wishes">{{
        formatNumber(stats.total)
      }}</span>
    </template>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-xs text-text-muted">
          <th class="px-4 py-2 font-medium"><span class="sr-only">Kind</span></th>
          <th class="px-2 py-2 text-right font-medium">Total</th>
          <th class="px-2 py-2 text-right font-medium">Percent</th>
          <th class="px-4 py-2 text-right font-medium">Pity avg</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label + row.rank" :title="row.title">
          <td class="px-4 py-1" :class="row.sub ? 'pl-8 text-text-secondary' : 'font-medium'">
            <span v-if="row.sub" class="text-text-muted" aria-hidden="true">└ </span>
            <span :class="row.sub ? '' : row.rank === 5 ? 'text-rarity-5' : 'text-rarity-4'">{{
              row.label
            }}</span>
          </td>
          <td class="tabular px-2 py-1 text-right font-mono">{{ formatNumber(row.count) }}</td>
          <td class="tabular px-2 py-1 text-right font-mono text-text-secondary">
            {{ row.share }}
          </td>
          <td class="tabular px-4 py-1 text-right font-mono" :title="row.pityTitle">
            {{ row.pity }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="stats.fives.length" class="border-t border-border-default px-4 py-3">
      <WishFiveChips
        :rows="stats.fives"
        :banner="stats.banner"
        :soft="SOFT_PITY[stats.banner]"
        :limit="30"
      />
    </div>
  </UiPanel>
</template>
