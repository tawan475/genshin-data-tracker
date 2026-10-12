<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDownUp, Clock, Sparkles } from 'lucide-vue-next'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import WishBannerCard from '@/components/wishes/WishBannerCard.vue'
import WishBarChart from '@/components/wishes/WishBarChart.vue'
import WishSummaryTable from '@/components/wishes/WishSummaryTable.vue'
import WishTransferDialog from '@/components/wishes/WishTransferDialog.vue'
import { useWishHistory } from '@/components/wishes/use-wish-history'
import { useWishStats } from '@/components/wishes/use-wish-stats'
import { WISH_BANNERS, wishMinute } from '@/components/wishes/wish-labels'
import { PRIMOS_PER_PULL, monthlyPulls, type BannerStats } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { useAccount, useReadOnly } from './context'

/**
 * Wish history overview, after paimon.moe's /wish: a card per banner
 * (lifetime pulls and Primogems, 5★ / 4★ pity, the latest pulls), pulls
 * per month by rarity, and each banner's summary table with its 5★s.
 * Each banner's own page lists every pull. History arrives from irminsul
 * (after Wish → History is opened in game) or a UIGF / paimon.moe file;
 * live events re-read it.
 */
const account = useAccount()
const readOnly = useReadOnly()
const wishes = useWishHistory(() => account.value.id)
const history = computed(() => wishes.history.value)
const { stats, error: statsError, reload: reloadStats } = useWishStats(history)

/** Banners with pulls; Beginners' only when used, as paimon.moe does. */
const shown = computed(() =>
  WISH_BANNERS.map((b) => ({ info: b, stats: stats.value?.get(b.banner) })).filter(
    (b): b is { info: (typeof WISH_BANNERS)[number]; stats: BannerStats } =>
      !!b.stats && (b.info.banner !== 100 || b.stats.total > 0),
  ),
)
const detail = (slug: string) => ({
  name: 'account-wishes-banner',
  params: { accountId: account.value.id, banner: slug },
})

const months = computed(() => (stats.value ? monthlyPulls([...stats.value.values()]) : []))
const monthLabels = computed(() => months.value.map((m) => m.month))
const monthSeries = computed(() => [
  { label: '3★', values: months.value.map((m) => m.total - m.five - m.four), color: '--rarity-3' },
  { label: '4★', values: months.value.map((m) => m.four), color: '--rarity-4' },
  { label: '5★', values: months.value.map((m) => m.five), color: '--rarity-5' },
])

const newest = computed(() => {
  const h = history.value
  if (!h) return null
  let time = -1
  for (const pulls of h.banners.values()) time = Math.max(time, pulls.at(-1)?.time ?? -1)
  return time < 0 ? null : wishMinute(time)
})

const ready = computed(() => !!history.value && !!stats.value)
const loadError = computed(() => wishes.error.value ?? statsError.value)
function retry() {
  if (wishes.error.value) void wishes.reload()
  if (statsError.value) void reloadStats()
}

const dialog = ref(false)
</script>

<template>
  <div>
    <PageHeader title="Wish history">
      <template v-if="ready && history?.total" #meta>
        <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-secondary">
          <span class="flex items-center gap-1.5" title="Newest pull, game clock">
            <Clock class="size-4" aria-hidden="true" />
            <span class="tabular font-mono">{{ newest }}</span>
          </span>
          <span
            class="tabular font-mono"
            :title="`Wishes worth: ${formatNumber(history!.total)} wishes in Primogems`"
            >✦ {{ formatNumber(history!.total * PRIMOS_PER_PULL) }}</span
          >
        </p>
      </template>
      <template v-if="ready && history?.total" #actions>
        <UiButton size="sm" @click="dialog = true">
          <ArrowDownUp class="size-4" aria-hidden="true" />{{
            readOnly ? 'Export' : 'Import / export'
          }}
        </UiButton>
      </template>
    </PageHeader>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="ready && history && stats">
      <UiPanel v-if="history.total === 0" flush>
        <UiEmpty
          title="No wishes yet"
          body="Run irminsul and open Wish → History in game: it syncs the last six months. Older history: import a UIGF or paimon.moe file."
        >
          <template #icon><Sparkles aria-hidden="true" /></template>
          <UiButton v-if="!readOnly" variant="primary" @click="dialog = true">Import</UiButton>
        </UiEmpty>
      </UiPanel>

      <div v-else class="flex flex-col gap-4 lg:gap-6">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
          <WishBannerCard
            v-for="b in shown"
            :key="b.info.banner"
            :stats="b.stats"
            :to="detail(b.info.slug)"
          />
        </div>

        <UiPanel v-if="months.length > 1" title="Pulls per month">
          <WishBarChart
            :labels="monthLabels"
            :series="monthSeries"
            label="Pulls per month by rarity"
            :height="200"
          />
        </UiPanel>

        <div class="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <WishSummaryTable
            v-for="b in shown.filter((s) => s.stats.total > 0)"
            :key="b.info.banner"
            :stats="b.stats"
            :to="detail(b.info.slug)"
          />
        </div>
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4 lg:gap-6">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        <UiSkeleton v-for="n in 4" :key="n" class="h-44" />
      </div>
      <UiSkeleton class="h-64" />
    </div>

    <WishTransferDialog
      :open="dialog"
      :account="account"
      :history="history"
      :read-only="readOnly"
      @close="dialog = false"
      @changed="wishes.refresh()"
    />
  </div>
</template>
