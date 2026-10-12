<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowUpCircle } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import WishBarChart from '@/components/wishes/WishBarChart.vue'
import WishFiveChips from '@/components/wishes/WishFiveChips.vue'
import WishRuns from '@/components/wishes/WishRuns.vue'
import WishTable from '@/components/wishes/WishTable.vue'
import { useWishHistory } from '@/components/wishes/use-wish-history'
import { useWishStats } from '@/components/wishes/use-wish-stats'
import {
  WISH_BANNERS,
  bannerBySlug,
  formatPercent,
  formatPity,
  oddsOf,
} from '@/components/wishes/wish-labels'
import {
  EXPECTED_PITY,
  HARD_PITY,
  PRIMOS_PER_PULL,
  SOFT_PITY,
  pityHistogram,
} from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { useAccount } from './context'

/**
 * One banner's wish history, after paimon.moe's banner page and beyond it:
 * pulls and Primogems, both pities and what the next 5★ is, luck (the
 * average 5★ pity against the game's expected one), the spread of 5★
 * pities with the soft pity mark, each banner run with its 5★s, and every
 * pull in a searchable, paged table.
 */
const account = useAccount()
const route = useRoute()
const router = useRouter()
const wishes = useWishHistory(() => account.value.id)
const history = computed(() => wishes.history.value)
const { stats: all, error: statsError, reload: reloadStats } = useWishStats(history)

const info = computed(() => bannerBySlug(route.params.banner) ?? WISH_BANNERS[0]!)
const stats = computed(() => all.value?.get(info.value.banner) ?? null)
const hard = computed(() => HARD_PITY[info.value.banner])
const soft = computed(() => SOFT_PITY[info.value.banner])
const expected = computed(() => EXPECTED_PITY[info.value.banner])

function go(slug: string) {
  void router.replace({ name: 'account-wishes-banner', params: { ...route.params, banner: slug } })
}

const nextFive = computed(() => {
  const s = stats.value
  if (!s || !info.value.rated) return { value: '—', hint: 'No 50/50 on this banner' }
  if (s.guaranteed5 === null) {
    return { value: '?', hint: 'Not known: a pull is on a banner newer than the banner data' }
  }
  const r = s.rate5!
  const hint =
    `${oddsOf(s.banner)} won ${formatNumber(r.won)} · lost ${formatNumber(r.lost)}` +
    (r.rate !== null ? ` (${formatPercent(r.rate)})` : '') +
    ` · streak now: ${r.winStreak > 0 ? `${r.winStreak} won` : `${r.loseStreak} lost`}` +
    ` · longest: ${r.maxWinStreak} won, ${r.maxLoseStreak} lost` +
    (s.banner === 301 ? ' · Capturing Radiance not tracked' : ' · Epitomized Path not tracked')
  return { value: s.guaranteed5 ? 'Guaranteed' : oddsOf(s.banner), hint }
})

const luck = computed(() => {
  const s = stats.value
  if (!s?.five.count) return null
  const diff = s.five.avgPity - expected.value
  return {
    value: formatPity(Math.round(s.five.avgPity * 10) / 10),
    tone: diff <= 0 ? ('success' as const) : ('warning' as const),
    hint: `Average 5★ pity over ${formatNumber(s.five.count)}; the game's rates give about ${expected.value}: ${diff <= 0 ? 'luckier' : 'unluckier'} by ${formatPity(Math.abs(Math.round(diff * 10) / 10))}`,
  }
})

const histogram = computed(() =>
  stats.value ? pityHistogram(stats.value.fives, hard.value[0]) : [],
)
const histogramLabels = computed(() => histogram.value.map((_, i) => String(i + 1)))
const histogramSeries = computed(() => [
  {
    label: '5★',
    values: histogram.value,
    color: histogram.value.map((_, i) => (i + 1 >= soft.value ? '--rarity-5' : '--chart-1')),
  },
])
const histogramTitles = computed(() =>
  histogram.value.map((_, i) => `Pity ${i + 1}${i + 1 >= soft.value ? ' · soft pity' : ''}`),
)

const left = computed(() => (stats.value ? hard.value[0] - stats.value.pity5 : 0))
const ready = computed(() => !!stats.value)
const loadError = computed(() => wishes.error.value ?? statsError.value)
function retry() {
  if (wishes.error.value) void wishes.reload()
  if (statsError.value) void reloadStats()
}
</script>

<template>
  <div>
    <PageHeader :title="`Wish history · ${info.title}`">
      <template #meta>
        <UiButton
          variant="ghost"
          size="sm"
          :to="{ name: 'account-wishes', params: { accountId: account.id } }"
        >
          <ArrowLeft class="size-4" aria-hidden="true" />Wishes
        </UiButton>
      </template>
    </PageHeader>

    <div
      role="radiogroup"
      aria-label="Banner"
      class="scroll-hide scroll-fade-x -mx-3 mb-4 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0 lg:mb-6"
    >
      <FilterChip
        v-for="b in WISH_BANNERS"
        :key="b.banner"
        radio
        :pressed="info.banner === b.banner"
        :count="all?.get(b.banner)?.total"
        :title="b.title"
        @toggle="go(b.slug)"
        >{{ b.label }}</FilterChip
      >
    </div>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="stats">
      <UiPanel v-if="stats.total === 0" flush>
        <UiEmpty title="No pulls on this banner" />
      </UiPanel>

      <div v-else class="flex flex-col gap-4 lg:gap-6">
        <div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          <UiStat
            label="Pulls"
            :value="stats.total"
            exact
            :detail="`${formatNumber(stats.total * PRIMOS_PER_PULL)} Primogems`"
          />
          <UiStat
            label="5★ pity"
            :value="`${stats.pity5} / ${hard[0]}`"
            :hint="`${formatNumber(left)} to hard pity: ${formatNumber(left * PRIMOS_PER_PULL)} Primogems · soft pity from ${soft}`"
            :tone="stats.pity5 >= soft ? 'warning' : undefined"
          >
            <template v-if="stats.guaranteed5" #icon>
              <ArrowUpCircle class="size-3.5 text-success-text" aria-label="Guaranteed" />
            </template>
          </UiStat>
          <UiStat
            :label="info.rated ? 'Next 5★' : '4★ pity'"
            :value="info.rated ? nextFive.value : `${stats.pity4} / ${hard[1]}`"
            :hint="info.rated ? nextFive.hint : `Guaranteed at ${hard[1]}`"
            :tone="info.rated && stats.guaranteed5 ? 'success' : undefined"
          />
          <UiStat
            label="Avg 5★ pity"
            :value="luck?.value ?? '—'"
            :hint="luck?.hint ?? 'No 5★ yet'"
            :tone="luck?.tone"
          />
        </div>

        <div class="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <UiPanel flush>
            <template #header>
              <div class="flex items-baseline gap-3">
                <h2 class="text-base font-semibold">5★ pity</h2>
                <span
                  class="tabular font-mono text-sm text-text-muted"
                  :title="`${formatNumber(stats.five.count)} 5★ · ${formatPercent(stats.five.share)} of pulls`"
                  >{{ formatNumber(stats.five.count) }}</span
                >
              </div>
            </template>
            <div class="px-4 pt-3 pb-2">
              <WishBarChart
                :labels="histogramLabels"
                :series="histogramSeries"
                :titles="histogramTitles"
                label="How many 5★ took each pity"
                :height="160"
              />
            </div>
          </UiPanel>

          <UiPanel title="Rarities" flush>
            <dl class="grid grid-cols-3 gap-2 p-4 text-center">
              <div
                v-for="line in [
                  { label: '5★', l: stats.five, tone: 'text-rarity-5' },
                  { label: '4★ character', l: stats.fourCharacter, tone: 'text-rarity-4' },
                  { label: '4★ weapon', l: stats.fourWeapon, tone: 'text-rarity-4' },
                ]"
                :key="line.label"
                class="rounded-lg bg-surface-overlay px-2 py-2"
                :title="`${formatPercent(line.l.share)} of pulls · average pity ${formatPity(line.l.avgPity)}`"
              >
                <dt class="text-xs text-text-muted">{{ line.label }}</dt>
                <dd class="tabular font-mono text-lg font-medium" :class="line.tone">
                  {{ formatNumber(line.l.count) }}
                </dd>
                <dd class="tabular font-mono text-xs text-text-muted">
                  {{ formatPercent(line.l.share) }}
                </dd>
                <dd class="tabular font-mono text-xs text-text-muted">
                  ⌀ {{ line.l.count ? formatPity(line.l.avgPity) : '—' }}
                </dd>
              </div>
            </dl>
            <div v-if="stats.rate4" class="border-t border-border-default px-4 py-3 text-sm">
              <p
                class="flex justify-between text-text-secondary"
                :title="`Won ${stats.rate4.won} · lost ${stats.rate4.lost} · longest: won ${stats.rate4.maxWinStreak}, lost ${stats.rate4.maxLoseStreak}`"
              >
                <span>4★ won 50/50</span>
                <span class="tabular font-mono">{{
                  stats.rate4.rate === null ? '—' : formatPercent(stats.rate4.rate)
                }}</span>
              </p>
            </div>
          </UiPanel>
        </div>

        <UiPanel v-if="stats.fives.length" flush>
          <template #header>
            <div class="flex items-baseline gap-3">
              <h2 class="text-base font-semibold text-rarity-5">5★</h2>
              <span class="tabular font-mono text-sm text-text-muted">{{
                formatNumber(stats.five.count)
              }}</span>
            </div>
          </template>
          <div class="px-4 py-3">
            <WishFiveChips :rows="stats.fives" :banner="stats.banner" :soft="soft" :limit="60" />
          </div>
        </UiPanel>

        <WishRuns v-if="stats.runs.length" :runs="stats.runs" :banner="stats.banner" :soft="soft" />

        <WishTable :rows="stats.rows" :banner="stats.banner" />
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4 lg:gap-6">
      <div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <UiSkeleton v-for="n in 4" :key="n" class="h-[4.5rem]" />
      </div>
      <UiSkeleton class="h-64" />
    </div>
  </div>
</template>
