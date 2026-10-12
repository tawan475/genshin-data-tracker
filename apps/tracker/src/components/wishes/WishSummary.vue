<script setup lang="ts">
import { computed } from 'vue'
import { HARD_PITY, type BannerStats } from '@/data/wish-history'
import UiStat from '@/components/ui/UiStat.vue'
import { formatNumber } from '@/lib/format'

/**
 * A banner's figures: pulls, both pities (of the hard pity), and what the
 * next 5★ is on the event banners (50/50 or guaranteed; "?" past the banner
 * data). The 50/50 record goes in the tooltip.
 */
const props = defineProps<{ stats: BannerStats }>()

const hard = computed(() => HARD_PITY[props.stats.banner])
const odds = computed(() => (props.stats.banner === 302 ? '75/25' : '50/50'))

const next = computed(() => {
  const g = props.stats.guaranteed5
  if (g === null) return props.stats.banner === 301 || props.stats.banner === 302 ? '?' : '—'
  return g ? 'Guaranteed' : odds.value
})
const nextHint = computed(() => {
  const s = props.stats
  if (s.guaranteed5 === null) {
    return s.banner === 301 || s.banner === 302
      ? 'Not known: a pull is on a banner newer than the banner data'
      : 'No 50/50 on this banner'
  }
  const record = `${odds.value} won ${formatNumber(s.won5)} · lost ${formatNumber(s.lost5)}`
  const streak = s.lostStreak > 1 ? ` · lost ${s.lostStreak} in a row` : ''
  const radiance = s.banner === 301 ? ' · Capturing Radiance not tracked' : ''
  const path = s.banner === 302 ? ' · Epitomized Path not tracked' : ''
  return record + streak + radiance + path
})
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
    <UiStat label="Pulls" :value="stats.total" exact />
    <UiStat
      label="5★ pity"
      :value="`${formatNumber(stats.pity5)} / ${hard[0]}`"
      :hint="`${formatNumber(stats.pity5)} pulls since the last 5★; hard pity ${hard[0]}`"
      :tone="stats.pity5 >= 74 ? 'warning' : undefined"
    />
    <UiStat
      label="4★ pity"
      :value="`${formatNumber(stats.pity4)} / ${hard[1]}`"
      :hint="`${formatNumber(stats.pity4)} pulls since the last 4★`"
    />
    <UiStat
      label="Next 5★"
      :value="next"
      :hint="nextHint"
      :tone="stats.guaranteed5 ? 'success' : undefined"
    />
  </div>
</template>
