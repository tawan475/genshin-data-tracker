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
import WishFiveList from './WishFiveList.vue'
import { bannerInfo, formatPercent, formatPity } from './wish-labels'

/**
 * paimon.moe's summary of a banner: 5★ and 4★ (4★ split into characters and
 * weapons) with their share of all pulls and average pity, the 50/50s won
 * (75/25 on the weapon banner; won of won + lost, guaranteed ones left out),
 * in gold and purple, then the 5★ list. Streaks and the expected average
 * are tooltips.
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
  label: `Win ${odds}`,
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
  if (s.rate5) out.push(rateRow(s.rate5, 5, s.banner === 302 ? '75:25' : '50:50'))
  out.push(lineRow('4★', s.four, 4))
  out.push(lineRow('Character', s.fourCharacter, 4, true))
  out.push(lineRow('Weapon', s.fourWeapon, 4, true))
  if (s.rate4) out.push(rateRow(s.rate4, 4, '50:50'))
  return out
})
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm sm:p-4"
  >
    <table class="w-full text-sm">
      <thead>
        <tr>
          <th class="w-full pr-2 text-left text-base font-semibold">
            <RouterLink v-if="to" :to="to" class="hover:underline">{{ info.title }}</RouterLink>
            <span v-else>{{ info.title }}</span>
          </th>
          <th class="px-2 text-right text-xs font-medium text-text-muted">Total</th>
          <th class="px-2 text-right text-xs font-medium text-text-muted">Percent</th>
          <th class="pl-2 text-right text-xs font-medium whitespace-nowrap text-text-muted">
            Pity avg
          </th>
        </tr>
      </thead>
      <tbody class="font-semibold">
        <tr
          v-for="row in rows"
          :key="row.label + row.rank"
          class="border-t border-border-default"
          :class="row.rank === 5 ? 'text-rarity-5' : 'text-rarity-4'"
          :title="row.title"
        >
          <td class="py-1 pr-2 whitespace-nowrap" :class="row.sub ? 'pl-3' : ''">
            <span v-if="row.sub" aria-hidden="true">└ </span>{{ row.label }}
          </td>
          <td class="tabular px-2 py-1 text-right font-mono">{{ formatNumber(row.count) }}</td>
          <td class="tabular px-2 py-1 text-right font-mono">{{ row.share }}</td>
          <td class="tabular py-1 pl-2 text-right font-mono" :title="row.pityTitle">
            {{ row.pity }}
          </td>
        </tr>
      </tbody>
    </table>
    <WishFiveList v-if="stats.fives.length" :rows="stats.fives" :banner="stats.banner" />
  </section>
</template>
