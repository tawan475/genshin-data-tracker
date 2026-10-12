<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CircleArrowUp } from 'lucide-vue-next'
import { formatWishTime, wishItemInfo } from '@gdt/shared'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import WishBarChart from '@/components/wishes/WishBarChart.vue'
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
  type BannerRun,
} from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { useAccount } from './context'

/**
 * One banner's wish history, as paimon.moe's banner page: every pull in a
 * paged table, and beside it (above it on narrower screens) the pulls and
 * both pities, the rarity split as a ring, the pulls per banner run and
 * the spread of 5★ pities. Details are tooltips.
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

const banner = computed({
  get: () => info.value.slug,
  set: (slug: string) =>
    void router.replace({
      name: 'account-wishes-banner',
      params: { ...route.params, banner: slug },
    }),
})
/** Banners with pulls (and this one), for the switch. */
const bannerOptions = computed(() =>
  WISH_BANNERS.filter(
    (b) => b.banner === info.value.banner || (all.value?.get(b.banner)?.total ?? 0) > 0,
  ).map((b) => ({ value: b.slug, label: b.label, title: b.title })),
)

const fiveTitle = computed(() => {
  const s = stats.value
  if (!s) return ''
  const left = hard.value[0] - s.pity5
  const parts = [
    `${formatNumber(left)} to hard pity (${formatNumber(left * PRIMOS_PER_PULL)} Primogems)`,
    `soft pity from ${soft.value}`,
  ]
  if (s.guaranteed5 === true) parts.push('next 5★ is featured')
  else if (s.guaranteed5 === false) parts.push(`next 5★ is a ${oddsOf(s.banner)}`)
  if (s.five.count) {
    const diff = s.five.avgPity - EXPECTED_PITY[s.banner]
    parts.push(
      `average ${formatPity(Math.round(s.five.avgPity * 10) / 10)} (${diff <= 0 ? 'luckier' : 'unluckier'} than ${EXPECTED_PITY[s.banner]})`,
    )
  }
  return parts.join(' · ')
})

/** The rarity ring: 5★, 4★ and 3★ shares as one conic gradient. */
const split = computed(() => {
  const s = stats.value
  if (!s?.total) return null
  const lines = [
    { label: '5★', count: s.five.count, color: 'var(--rarity-5)', tone: 'text-rarity-5' },
    { label: '4★', count: s.four.count, color: 'var(--rarity-4)', tone: 'text-rarity-4' },
    {
      label: '3★',
      count: s.total - s.five.count - s.four.count,
      color: 'var(--rarity-3)',
      tone: 'text-rarity-3',
    },
  ]
  let at = 0
  const stops = lines.map((l) => {
    const from = at
    at += (l.count / s.total) * 100
    return `${l.color} ${from}% ${at}%`
  })
  return {
    lines: lines.map((l) => ({ ...l, share: formatPercent(l.count / s.total) })),
    gradient: `conic-gradient(${stops.join(', ')})`,
  }
})

/** Banner runs pulled on, newest first. */
const runs = computed(() => (stats.value ? [...stats.value.runs].reverse() : []))
const most = computed(() => Math.max(1, ...runs.value.map((r) => r.pulls)))
function runLabel(run: BannerRun): string {
  const b = run.banner
  if (info.value.banner === 302) {
    return b.featured5.map((key) => wishItemInfo('weapon', key)?.name ?? key).join(' · ')
  }
  return b.name400 ? `${b.name} / ${b.name400}` : b.name
}
const day = (utc: number) => formatWishTime(utc + 8 * 3600).slice(0, 10)
const runTitle = (run: BannerRun) =>
  `${runLabel(run)}\n${run.banner.version} · ${day(run.banner.start)} → ${day(run.banner.end)}\n` +
  `${formatNumber(run.pulls)} pulls · ${formatNumber(run.pulls * PRIMOS_PER_PULL)} Primogems`

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

/**
 * Where the cards go: beside the table from 2xl (paimon.moe's side column),
 * above it below that, the run list and pity spread under it on phones.
 * Without runs (standard, beginners') the spread takes the runs' place.
 */
const layout = computed(() =>
  runs.value.length
    ? "[grid-template-areas:'stats_pie'_'table_table'_'runs_runs'_'hist_hist'] md:grid-cols-[auto_auto_minmax(0,1fr)] md:[grid-template-areas:'stats_pie_runs'_'table_table_table'_'hist_hist_hist'] 2xl:grid-cols-[minmax(0,1fr)_auto_auto] 2xl:grid-rows-[auto_auto_auto_1fr] 2xl:[grid-template-areas:'table_stats_pie'_'table_runs_runs'_'table_hist_hist'_'table_._.']"
    : "[grid-template-areas:'stats_pie'_'table_table'_'hist_hist'] md:grid-cols-[auto_auto_minmax(0,1fr)] md:[grid-template-areas:'stats_pie_hist'_'table_table_table'] 2xl:grid-cols-[minmax(0,1fr)_auto_auto] 2xl:grid-rows-[auto_auto_1fr] 2xl:[grid-template-areas:'table_stats_pie'_'table_hist_hist'_'table_._.']",
)

const ready = computed(() => !!stats.value)
const loadError = computed(() => wishes.error.value ?? statsError.value)
function retry() {
  if (wishes.error.value) void wishes.reload()
  if (statsError.value) void reloadStats()
}
</script>

<template>
  <div>
    <PageHeader :title="`Wish history · ${info.title}`" />

    <div class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-3">
      <UiIconButton
        label="Wish history"
        :to="{ name: 'account-wishes', params: { accountId: account.id } }"
      >
        <ArrowLeft class="size-5" aria-hidden="true" />
      </UiIconButton>
      <h2 class="min-w-0 flex-1 truncate text-xl font-semibold">
        <span class="hidden text-text-muted sm:inline">Wish history ·</span>
        {{ info.title }}
      </h2>
      <div v-if="bannerOptions.length > 1" class="hidden md:block">
        <UiSegmented v-model="banner" :options="bannerOptions" label="Banner" />
      </div>
    </div>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="stats">
      <UiPanel v-if="stats.total === 0" flush>
        <UiEmpty title="No pulls on this banner" />
      </UiPanel>

      <div
        v-else
        class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 sm:gap-4"
        :class="layout"
      >
        <!-- Pulls and both pities, as paimon.moe's side tile. -->
        <div
          class="flex h-full flex-col items-center justify-center gap-0.5 rounded-xl border border-border-default bg-surface-raised px-4 py-3 text-center shadow-sm [grid-area:stats] sm:px-6"
        >
          <p
            class="text-xs text-text-muted"
            :title="`${formatNumber(stats.total * PRIMOS_PER_PULL)} Primogems`"
          >
            Total
          </p>
          <p class="tabular font-mono text-xl font-semibold">{{ formatNumber(stats.total) }}</p>
          <p class="mt-2 text-xs text-text-muted">5★ pity</p>
          <p
            class="tabular flex items-center gap-1 font-mono text-xl font-semibold text-rarity-5"
            :title="fiveTitle"
          >
            <CircleArrowUp
              v-if="stats.guaranteed5"
              class="size-4"
              aria-label="Next 5★ is featured"
            />{{ stats.pity5 }}
          </p>
          <p class="mt-2 text-xs text-text-muted">4★ pity</p>
          <p
            class="tabular flex items-center gap-1 font-mono text-xl font-semibold text-rarity-4"
            :title="`${hard[1] - stats.pity4} to a sure 4★`"
          >
            <CircleArrowUp
              v-if="stats.guaranteed4"
              class="size-4"
              aria-label="Next 4★ is featured"
            />{{ stats.pity4 }}
          </p>
        </div>

        <!-- Rarity split. -->
        <div
          v-if="split"
          class="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm [grid-area:pie] sm:p-4"
        >
          <div
            class="relative size-24 shrink-0 rounded-full"
            :style="{ background: split.gradient }"
            role="img"
            :aria-label="split.lines.map((l) => `${l.label} ${l.share}`).join(', ')"
          >
            <span class="absolute inset-4 rounded-full bg-surface-raised" />
          </div>
          <dl class="grid w-full grid-cols-[auto_1fr_auto] gap-x-2 text-sm">
            <template v-for="line in split.lines" :key="line.label">
              <dt class="font-semibold" :class="line.tone">{{ line.label }}</dt>
              <dd class="tabular text-right font-mono">{{ formatNumber(line.count) }}</dd>
              <dd class="tabular text-right font-mono text-text-muted">{{ line.share }}</dd>
            </template>
          </dl>
        </div>

        <!-- Pulls per banner run. -->
        <section
          v-if="runs.length"
          class="min-w-0 self-stretch rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm [grid-area:runs] sm:p-4"
        >
          <h2 class="mb-2 text-sm font-semibold">Banners</h2>
          <ul class="flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
            <li
              v-for="run in runs"
              :key="run.banner.start + run.banner.name"
              :title="runTitle(run)"
            >
              <div class="flex items-baseline gap-2 text-sm">
                <span class="min-w-0 flex-1 truncate">{{ runLabel(run) }}</span>
                <span class="tabular font-mono">{{ formatNumber(run.pulls) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="h-1.5 flex-1 rounded-full bg-surface-sunken" aria-hidden="true">
                  <span
                    class="block h-full rounded-full bg-accent"
                    :style="{ width: `${(run.pulls / most) * 100}%` }"
                  />
                </span>
                <span v-if="run.fives.length" class="max-w-[60%] truncate text-xs text-rarity-5">{{
                  run.fives.map((f) => `${f.pull.item.name} ${f.pity}`).join(' · ')
                }}</span>
              </div>
            </li>
          </ul>
        </section>

        <!-- 5★ pity spread. -->
        <section
          v-if="stats.fives.length"
          class="min-w-0 self-stretch rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm [grid-area:hist] sm:p-4"
        >
          <h2
            class="mb-2 text-sm font-semibold"
            :title="`${formatNumber(stats.five.count)} 5★ · soft pity from ${soft}`"
          >
            5★ pity
          </h2>
          <WishBarChart
            :labels="histogramLabels"
            :series="histogramSeries"
            :titles="histogramTitles"
            label="How many 5★ took each pity"
            :height="140"
          />
        </section>

        <div class="min-w-0 [grid-area:table]">
          <WishTable :rows="stats.rows" :banner="stats.banner" />
        </div>
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
        <UiSkeleton v-for="n in 3" :key="n" class="h-48" />
      </div>
      <UiSkeleton class="h-96" />
    </div>
  </div>
</template>
