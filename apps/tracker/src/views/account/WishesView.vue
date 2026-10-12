<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowDownUp, Clock, Sparkles } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import WishBannerCard from '@/components/wishes/WishBannerCard.vue'
import WishBannerSummary from '@/components/wishes/WishBannerSummary.vue'
import WishMonthChart from '@/components/wishes/WishMonthChart.vue'
import WishSmallSummary from '@/components/wishes/WishSmallSummary.vue'
import WishTransferDialog from '@/components/wishes/WishTransferDialog.vue'
import { useWishHistory } from '@/components/wishes/use-wish-history'
import { useWishStats } from '@/components/wishes/use-wish-stats'
import { WISH_BANNERS, bannerInfo, formatPity, wishMinute } from '@/components/wishes/wish-labels'
import { EXPECTED_PITY, PRIMOS_PER_PULL, monthlyPulls, type BannerStats } from '@/data/wish-history'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useAccount, useReadOnly } from './context'

/**
 * Wish history overview: a card per banner (lifetime pulls, 5★ pity with
 * the next 5★'s odds and the way to hard pity, 4★ pity; the chevron folds
 * out the latest pulls below the card), pulls per month by rarity beside
 * what every wish was worth and the Character Event's average 5★ pity, then
 * each banner's numbers: Character and Weapon with every 5★ as tiles,
 * Standard and Chronicled smaller. Each banner's page lists every pull.
 * History arrives from irminsul (Wish → History opened in game, once a
 * day) or a UIGF / paimon.moe file; live events re-read it.
 */
const account = useAccount()
const readOnly = useReadOnly()
const wishes = useWishHistory(() => account.value.id)
const history = computed(() => wishes.history.value)
const { stats, error: statsError, reload: reloadStats } = useWishStats(history)

type Shown = { info: (typeof WISH_BANNERS)[number]; stats: BannerStats }
/** Banners with pulls; Beginners' only when used, as paimon.moe does. */
const shown = computed(() =>
  WISH_BANNERS.map((b) => ({ info: b, stats: stats.value?.get(b.banner) })).filter(
    (b): b is Shown => !!b.stats && (b.info.banner !== 100 || b.stats.total > 0),
  ),
)
const rated = computed(() => shown.value.filter((b) => b.info.rated && b.stats.total > 0))
const plain = computed(() => shown.value.filter((b) => !b.info.rated && b.stats.total > 0))
const detail = (banner: UigfGachaType) => ({
  name: 'account-wishes-banner',
  params: { accountId: account.value.id, banner: bannerInfo(banner).slug },
})

const months = computed(() => (stats.value ? monthlyPulls([...stats.value.values()]) : []))

/** The Character Event's average 5★ pity against the expected one. */
const avgPity = computed(() => {
  const s = stats.value?.get(301)
  if (!s?.five.count) return null
  const expected = EXPECTED_PITY[301]
  const diff = Math.round((s.five.avgPity - expected) * 10) / 10
  return {
    value: formatPity(Math.round(s.five.avgPity * 100) / 100),
    sub: `${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${formatPity(Math.abs(diff))} vs ${expected} expected`,
    tone: diff > 0 ? 'text-warning-text' : diff < 0 ? 'text-success-text' : 'text-text-muted',
  }
})

/** The newest pull, game clock. */
const newest = computed(() => {
  const h = history.value
  if (!h) return null
  let time = -1
  for (const pulls of h.banners.values()) time = Math.max(time, pulls.at(-1)?.time ?? -1)
  return time < 0 ? null : wishMinute(time)
})
/** When new pulls last arrived, if the server says. */
const synced = computed(() => {
  const at = history.value?.updatedAt
  if (!at) return null
  return {
    text: `Synced ${formatRelative(at)}`,
    title: `New wishes stored ${formatDateTime(at)}`,
    fresh: Date.now() - at < 26 * 3600 * 1000,
  }
})

const ready = computed(() => !!history.value && !!stats.value)
const loadError = computed(() => wishes.error.value ?? statsError.value)
function retry() {
  if (wishes.error.value) void wishes.reload()
  if (statsError.value) void reloadStats()
}

const dialog = ref(false)

const SYNC_HELP =
  "Open Wish → History in game once a day (you can close it right away): irminsul syncs every banner, then each new wish while the key lasts (~24 h). The game's wish link brings the last six months too. Older than 6 months: import a paimon.moe backup or UIGF file."
</script>

<template>
  <div>
    <PageHeader title="Wish history">
      <template v-if="ready && history?.total" #meta>
        <p class="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-text-secondary">
          <span v-if="newest" class="flex items-center gap-2" title="Newest pull, game clock">
            <Clock class="size-4" aria-hidden="true" />
            <span class="tabular font-mono">{{ newest }}</span>
          </span>
          <span
            v-if="synced"
            class="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-0.5 text-xs"
            :title="synced.title"
          >
            <span
              class="size-2 rounded-full"
              :class="synced.fresh ? 'bg-success-text' : 'bg-text-muted'"
              aria-hidden="true"
            />{{ synced.text }}
          </span>
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
        <div :title="SYNC_HELP">
          <UiEmpty
            title="No wishes yet"
            body="Open Wish → History in game once a day (you can close it right away), or import with the game's wish link. Older than 6 months: import a paimon.moe backup or UIGF file."
          >
            <template #icon><Sparkles aria-hidden="true" /></template>
            <UiButton v-if="!readOnly" variant="primary" @click="dialog = true">Import</UiButton>
          </UiEmpty>
        </div>
      </UiPanel>

      <div v-else class="flex flex-col gap-4">
        <!-- items-start: an open card's list hangs below it, never stretching its row. -->
        <section
          aria-label="Banners"
          class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14.5rem),1fr))] items-start gap-3 sm:gap-3.5"
        >
          <WishBannerCard
            v-for="b in shown"
            :key="b.info.banner"
            :stats="b.stats"
            :to="detail(b.info.banner)"
          />
        </section>

        <div class="flex flex-wrap items-stretch gap-3.5">
          <WishMonthChart :months="months" class="min-w-0 flex-[999_1_640px]" />
          <section aria-label="Totals" class="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5">
            <UiStat
              label="Wishes worth"
              :value="`✦ ${formatNumber(history.total * PRIMOS_PER_PULL)}`"
              :hint="`${formatNumber(history.total)} wishes × ${PRIMOS_PER_PULL} Primogems`"
              class="flex-1"
            >
              <span class="tabular font-mono text-xs text-text-muted"
                >{{ formatNumber(history.total) }} wishes</span
              >
            </UiStat>
            <UiStat
              v-if="avgPity"
              label="Avg 5★ pity"
              :value="avgPity.value"
              :hint="`Character Event: the average pity of every 5★, against about ${EXPECTED_PITY[301]} expected with soft pity`"
              class="flex-1"
            >
              <span class="tabular font-mono text-xs" :class="avgPity.tone">{{ avgPity.sub }}</span>
            </UiStat>
          </section>
        </div>

        <WishBannerSummary
          v-for="b in rated"
          :key="b.info.banner"
          :stats="b.stats"
          :to="detail(b.info.banner)"
        />

        <div
          v-if="plain.length"
          class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,23rem),1fr))] items-start gap-3.5"
        >
          <WishSmallSummary
            v-for="b in plain"
            :key="b.info.banner"
            :stats="b.stats"
            :to="detail(b.info.banner)"
          />
        </div>
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14.5rem),1fr))] gap-3.5">
        <UiSkeleton v-for="n in 4" :key="n" class="h-72" />
      </div>
      <UiSkeleton class="h-56" />
      <UiSkeleton class="h-80" />
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
