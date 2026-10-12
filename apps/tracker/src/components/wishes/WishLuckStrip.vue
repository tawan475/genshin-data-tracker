<script setup lang="ts">
import { computed } from 'vue'
import UiStat from '@/components/ui/UiStat.vue'
import { EXPECTED_PITY, PRIMOS_PER_PULL, type BannerStats } from '@/data/wish-history'
import { formatCompact, formatNumber } from '@/lib/format'
import { formatPercent, formatPity } from './wish-labels'

/**
 * How lucky the Character Event has been: the average 5★ pity against the
 * expected one with soft pity, 50/50s won, the win streak now and the
 * longest, 4★ rate-ups won; and what every wish was worth. Phones leave the
 * 4★ tile out.
 */
const props = defineProps<{ stats: BannerStats | undefined; total: number }>()

interface Tile {
  label: string
  value: string | null
  sub: string
  /** The sub line's wider form, from sm. */
  wide?: string
  tone: string
  hint: string
  phone: boolean
}

const tiles = computed<Tile[]>(() => {
  const s = props.stats
  const expected = EXPECTED_PITY[301]
  const fives = s?.five.count ?? 0
  const diff = fives ? s!.five.avgPity - expected : 0
  const rate5 = s?.rate5
  const rate4 = s?.rate4
  const decided = (r: typeof rate5) => (r ? r.won + r.lost : 0)
  const rounded = Math.round(diff * 10) / 10
  const signed = `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${formatPity(Math.abs(rounded))}`
  return [
    {
      label: 'Avg 5★ pity',
      value: fives ? formatPity(Math.round(s!.five.avgPity * 10) / 10) : null,
      sub: fives ? `${signed} vs expected` : '',
      wide: fives ? `${signed} vs ${expected} expected` : '',
      tone:
        rounded > 0 ? 'text-warning-text' : rounded < 0 ? 'text-success-text' : 'text-text-muted',
      hint: `Character Event, ${formatNumber(fives)} 5★ · expected about ${expected} with soft pity`,
      phone: true,
    },
    {
      label: '50/50 won',
      value: rate5?.rate != null ? formatPercent(Math.round(rate5.rate * 1000) / 1000) : null,
      sub:
        rate5 && decided(rate5)
          ? `${formatNumber(rate5.won)} of ${formatNumber(decided(rate5))}`
          : '',
      tone: 'text-text-muted',
      hint: 'Character Event: a featured 5★ when it was a coin flip (guaranteed ones left out)',
      phone: true,
    },
    {
      label: 'Win streak',
      value: rate5 && decided(rate5) ? formatNumber(rate5.winStreak) : null,
      sub: rate5 && decided(rate5) ? `best ${formatNumber(rate5.maxWinStreak)}` : '',
      wide: rate5 && decided(rate5) ? `best ${formatNumber(rate5.maxWinStreak)} in a row` : '',
      tone: 'text-text-muted',
      hint: rate5
        ? `50/50s won in a row now${rate5.loseStreak ? ` (lost ${rate5.loseStreak} in a row)` : ''} · longest: won ${rate5.maxWinStreak}, lost ${rate5.maxLoseStreak}`
        : '',
      phone: true,
    },
    {
      label: '4★ rate-up won',
      value: rate4?.rate != null ? formatPercent(Math.round(rate4.rate * 1000) / 1000) : null,
      sub:
        rate4 && decided(rate4)
          ? `${formatNumber(rate4.won)} of ${formatNumber(decided(rate4))}`
          : '',
      tone: 'text-text-muted',
      hint: 'Character Event: a featured 4★ when it was a coin flip',
      phone: false,
    },
    {
      label: 'Wishes worth',
      value: `✦ ${formatCompact(props.total * PRIMOS_PER_PULL)}`,
      sub: `${formatNumber(props.total)} wishes`,
      tone: 'text-text-muted',
      hint: `✦ ${formatNumber(props.total * PRIMOS_PER_PULL)} Primogems (${PRIMOS_PER_PULL} a wish)`,
      phone: true,
    },
  ]
})
</script>

<template>
  <section
    aria-label="Luck"
    class="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] sm:gap-3.5"
  >
    <UiStat
      v-for="tile in tiles"
      :key="tile.label"
      :label="tile.label"
      :value="tile.value"
      :hint="tile.hint"
      :class="tile.phone ? '' : 'hidden! sm:flex!'"
    >
      <span v-if="tile.sub" class="tabular truncate font-mono text-xs" :class="tile.tone">
        <template v-if="tile.wide">
          <span class="sm:hidden">{{ tile.sub }}</span
          ><span class="hidden sm:inline">{{ tile.wide }}</span>
        </template>
        <template v-else>{{ tile.sub }}</template>
      </span>
    </UiStat>
  </section>
</template>
