<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import WishNowCard from '@/components/wishes/WishNowCard.vue'
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
import { EXPECTED_PITY, PRIMOS_PER_PULL, type BannerStats } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { useAccount } from './context'

/**
 * One banner's wish history: where it stands now (pity, the next 5★'s odds,
 * the way to hard pity), four totals, the banner runs pulled on and every
 * pull in a paged table. The switch moves between banners in place.
 */
const account = useAccount()
const route = useRoute()
const router = useRouter()
const wishes = useWishHistory(() => account.value.id)
const history = computed(() => wishes.history.value)
const { stats: all, error: statsError, reload: reloadStats } = useWishStats(history)

const info = computed(() => bannerBySlug(route.params.banner) ?? WISH_BANNERS[0]!)
const stats = computed(() => all.value?.get(info.value.banner) ?? null)

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

interface Tile {
  label: string
  value: string | null
  sub: string
  tone: string
  hint: string
}

/** Pulls and the average 5★ pity; the 50/50s and the streak where there is one, else the 5★ and 4★ counts. */
function tilesOf(s: BannerStats): Tile[] {
  const expected = EXPECTED_PITY[s.banner]
  const diff = Math.round((s.five.avgPity - expected) * 10) / 10
  const odds = oddsOf(s.banner)
  const out: Tile[] = [
    {
      label: 'Pulls',
      value: formatNumber(s.total),
      sub: `✦ ${formatNumber(s.total * PRIMOS_PER_PULL)}`,
      tone: 'text-text-muted',
      hint: `${formatNumber(s.total)} wishes × ${PRIMOS_PER_PULL} Primogems`,
    },
    {
      label: 'Avg 5★ pity',
      value: s.five.count ? formatPity(Math.round(s.five.avgPity * 10) / 10) : null,
      sub: s.five.count
        ? `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${formatPity(Math.abs(diff))} vs ${expected}`
        : '',
      tone: diff > 0 ? 'text-warning-text' : diff < 0 ? 'text-success-text' : 'text-text-muted',
      hint: `${formatNumber(s.five.count)} 5★ · expected about ${expected} with soft pity`,
    },
  ]
  const r = s.rate5
  if (r) {
    out.push(
      {
        label: `${odds} won`,
        value: r.rate === null ? null : formatPercent(Math.round(r.rate * 1000) / 1000),
        sub: `${formatNumber(r.won)} won · ${formatNumber(r.lost)} lost`,
        tone: 'text-text-muted',
        hint: `A featured 5★ when it was a ${odds} (guaranteed ones left out)`,
      },
      {
        label: 'Win streak',
        value: r.won + r.lost ? formatNumber(r.winStreak) : null,
        sub: `best ${formatNumber(r.maxWinStreak)} · worst ${formatNumber(r.maxLoseStreak)} lost`,
        tone: 'text-text-muted',
        hint: `${odds}s won in a row now${r.loseStreak ? ` (lost ${r.loseStreak} in a row)` : ''}; the longest runs won and lost`,
      },
    )
  } else {
    out.push(
      {
        label: '5★',
        value: formatNumber(s.five.count),
        sub: formatPercent(s.five.share),
        tone: 'text-text-muted',
        hint: '5★ pulls and their share of all',
      },
      {
        label: '4★',
        value: formatNumber(s.four.count),
        sub: formatPercent(s.four.share),
        tone: 'text-text-muted',
        hint: `4★ pulls and their share of all · average pity ${formatPity(Math.round(s.four.avgPity * 100) / 100)}`,
      },
    )
  }
  return out
}
const tiles = computed(() => (stats.value ? tilesOf(stats.value) : []))

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

    <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-3 sm:mb-6">
      <UiIconButton
        label="Wish history"
        :to="{ name: 'account-wishes', params: { accountId: account.id } }"
      >
        <ArrowLeft class="size-5" aria-hidden="true" />
      </UiIconButton>
      <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ info.title }}</h2>
      <div
        v-if="bannerOptions.length > 1"
        class="scroll-hide scroll-fade-x max-w-full min-w-0 overflow-x-auto sm:scroll-fade-none"
      >
        <UiSegmented v-model="banner" :options="bannerOptions" label="Banner" />
      </div>
    </div>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="stats">
      <UiPanel v-if="stats.total === 0" flush>
        <UiEmpty title="No pulls on this banner" />
      </UiPanel>

      <div v-else class="flex flex-col gap-4 sm:gap-6">
        <div class="flex flex-wrap gap-3.5">
          <WishNowCard :stats="stats" class="min-w-0 flex-[999_1_560px]" />
          <section
            aria-label="Totals"
            class="grid min-w-0 flex-[1_1_380px] grid-cols-2 gap-2.5 sm:gap-3.5"
          >
            <UiStat
              v-for="tile in tiles"
              :key="tile.label"
              :label="tile.label"
              :value="tile.value"
              :hint="tile.hint"
            >
              <span v-if="tile.sub" class="tabular truncate font-mono text-xs" :class="tile.tone">{{
                tile.sub
              }}</span>
            </UiStat>
          </section>
        </div>

        <WishRuns v-if="stats.runs.length" :stats="stats" />

        <WishTable :rows="stats.rows" :banner="stats.banner" />
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4 sm:gap-6">
      <div class="flex flex-wrap gap-3.5">
        <UiSkeleton class="h-56 min-w-0 flex-[999_1_560px]" />
        <UiSkeleton class="h-56 min-w-0 flex-[1_1_380px]" />
      </div>
      <UiSkeleton class="h-64" />
      <UiSkeleton class="h-96" />
    </div>
  </div>
</template>
