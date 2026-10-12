<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownUp, Sparkles } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import WishBannerCard from '@/components/wishes/WishBannerCard.vue'
import WishJourney from '@/components/wishes/WishJourney.vue'
import WishLuckStrip from '@/components/wishes/WishLuckStrip.vue'
import WishMonthChart from '@/components/wishes/WishMonthChart.vue'
import WishSummaryTable from '@/components/wishes/WishSummaryTable.vue'
import WishTransferDialog from '@/components/wishes/WishTransferDialog.vue'
import { useWishHistory } from '@/components/wishes/use-wish-history'
import { useWishStats } from '@/components/wishes/use-wish-stats'
import { WISH_BANNERS, bannerInfo, wishMinute } from '@/components/wishes/wish-labels'
import { monthlySplit, type BannerStats } from '@/data/wish-history'
import { formatDateTime, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAccount, useReadOnly } from './context'

/**
 * Wish history overview: a card per banner (5★ pity against hard pity, the
 * next 5★'s odds, 4★ pity, the last 5★), the Character Event's luck, every
 * 5★ of a banner as a column of its pity, pulls per month by banner type
 * and paimon.moe's numbers for the banner picked on the 5★ journey. Each
 * banner's page lists every pull. History arrives from irminsul (Wish →
 * History opened in game, once a day) or a UIGF / paimon.moe file; live
 * events re-read it.
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
const detail = (banner: UigfGachaType) => ({
  name: 'account-wishes-banner',
  params: { accountId: account.value.id, banner: bannerInfo(banner).slug },
})

/** The banner on the 5★ journey and the numbers table, remembered per device. */
const JOURNEY_KEY = 'wishes:journey'
const picked = ref<UigfGachaType>((Number(readStorage(JOURNEY_KEY)) || 301) as UigfGachaType)
watch(picked, (b) => writeStorage(JOURNEY_KEY, String(b)))
const withPulls = computed(() => shown.value.filter((b) => b.stats.total > 0))
const journeyOptions = computed(() =>
  withPulls.value.map((b) => ({ value: b.info.banner, label: b.info.label, title: b.info.title })),
)
const selected = computed(
  () =>
    withPulls.value.find((b) => b.info.banner === picked.value)?.stats ??
    withPulls.value[0]?.stats ??
    null,
)
const journeyBanner = computed({
  get: () => selected.value?.banner ?? picked.value,
  set: (b: UigfGachaType) => (picked.value = b),
})

const months = computed(() => (stats.value ? monthlySplit([...stats.value.values()]) : []))

/** When new pulls last arrived, and the newest pull's game time, for the header chip. */
const synced = computed(() => {
  const at = history.value?.updatedAt
  if (!at) return null
  let newest = -1
  for (const pulls of history.value!.banners.values()) {
    newest = Math.max(newest, pulls.at(-1)?.time ?? -1)
  }
  return {
    text: `Synced ${formatRelative(at)}`,
    title: `New wishes stored ${formatDateTime(at)}${newest >= 0 ? ` · newest pull ${wishMinute(newest)} (game clock)` : ''}`,
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
      <template v-if="ready && history?.total && synced" #meta>
        <span
          class="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-1 text-xs text-text-secondary"
          :title="synced.title"
        >
          <span
            class="size-2 rounded-full"
            :class="synced.fresh ? 'bg-success-text' : 'bg-text-muted'"
            aria-hidden="true"
          />{{ synced.text }}
        </span>
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

      <div v-else class="flex flex-col gap-4 sm:gap-6">
        <section
          aria-label="Banners"
          class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14.5rem),1fr))] gap-3 sm:gap-3.5"
        >
          <WishBannerCard
            v-for="b in shown"
            :key="b.info.banner"
            :stats="b.stats"
            :to="detail(b.info.banner)"
          />
        </section>

        <WishLuckStrip :stats="stats.get(301)" :total="history.total" />

        <WishJourney
          v-if="selected"
          v-model="journeyBanner"
          :stats="selected"
          :options="journeyOptions"
        />

        <div class="flex flex-wrap items-start gap-3.5">
          <WishMonthChart :months="months" class="min-w-0 flex-[999_1_560px]" />
          <WishSummaryTable
            v-if="selected"
            :stats="selected"
            :to="detail(selected.banner)"
            class="min-w-0 flex-[1_1_400px]"
          />
        </div>
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4 sm:gap-6">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14.5rem),1fr))] gap-3.5">
        <UiSkeleton v-for="n in 4" :key="n" class="h-56" />
      </div>
      <UiSkeleton class="h-24" />
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
