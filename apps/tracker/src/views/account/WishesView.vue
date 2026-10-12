<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownUp, Clock, Sparkles } from 'lucide-vue-next'
import type { UigfGachaType } from '@gdt/shared'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import WishHighlights from '@/components/wishes/WishHighlights.vue'
import WishList from '@/components/wishes/WishList.vue'
import WishSummary from '@/components/wishes/WishSummary.vue'
import WishTransferDialog from '@/components/wishes/WishTransferDialog.vue'
import { useWishHistory } from '@/components/wishes/use-wish-history'
import { WISH_BANNERS, wishMinute } from '@/components/wishes/wish-labels'
import { useResource } from '@/data/use-resource'
import { HARD_PITY, bannerStats, eventBanners, type BannerFile } from '@/data/wish-history'
import { loadGameIcons } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAccount, useReadOnly } from './context'

/**
 * Wish history: per banner (the game's 301 and 400 together), the pulls,
 * both pities, the 50/50 state and every 5★ / 4★ with the pity it took,
 * then the full list. It arrives from irminsul (after Wish → History is
 * opened in game) or a UIGF / paimon.moe file; live events re-read it.
 */
const account = useAccount()
const readOnly = useReadOnly()
const wishes = useWishHistory(() => account.value.id)

/** Banner dates and featured items (paimon.moe's data, MIT), loaded with the page. */
const banners = useResource(
  () => 0,
  async () => {
    const [file] = await Promise.all([
      import('@/data/wish-banners.json').then((m) => m.default as unknown as BannerFile),
      loadGameIcons(),
    ])
    return file
  },
)

const BANNER_KEY = 'wishes:banner'
const stored = Number(readStorage(BANNER_KEY))
const banner = ref<UigfGachaType>(
  WISH_BANNERS.some((b) => b.banner === stored) ? (stored as UigfGachaType) : 301,
)
watch(banner, (value) => writeStorage(BANNER_KEY, String(value)))

const history = computed(() => wishes.history.value)
const events = computed(() =>
  banners.data.value && history.value
    ? eventBanners(banners.data.value, history.value.timezone)
    : null,
)
const stats = computed(() => {
  const h = history.value
  if (!h) return null
  return bannerStats(banner.value, h.banners.get(banner.value) ?? [], {
    timezone: h.timezone,
    banners: events.value,
  })
})
const counts = computed(() => {
  const out: Partial<Record<UigfGachaType, number>> = {}
  for (const { banner: b } of WISH_BANNERS) out[b] = history.value?.banners.get(b)?.length ?? 0
  return out
})
// A banner with nothing to show: the first one that has pulls.
watch(
  history,
  (h) => {
    if (!h || h.total === 0 || (h.banners.get(banner.value)?.length ?? 0) > 0) return
    const first = WISH_BANNERS.find((b) => (h.banners.get(b.banner)?.length ?? 0) > 0)
    if (first) banner.value = first.banner
  },
  { immediate: true },
)

const newest = computed(() => {
  const h = history.value
  if (!h) return null
  let time = -1
  for (const pulls of h.banners.values()) time = Math.max(time, pulls.at(-1)?.time ?? -1)
  return time < 0 ? null : wishMinute(time)
})

const ready = computed(() => !!history.value && !!banners.data.value)
const loadError = computed(() => wishes.error.value ?? banners.error.value)
function retry() {
  if (wishes.error.value) void wishes.reload()
  if (banners.error.value) void banners.reload()
}

const dialog = ref(false)
</script>

<template>
  <div>
    <PageHeader title="Wish history">
      <template v-if="ready" #meta>
        <p
          v-if="newest"
          class="flex items-center gap-1.5 text-text-secondary"
          :title="`Newest pull, game clock · ${formatNumber(history!.total)} pulls`"
        >
          <Clock class="size-4" aria-hidden="true" />
          <span class="tabular font-mono">{{ newest }}</span>
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
        <div
          role="radiogroup"
          aria-label="Banner"
          class="scroll-hide scroll-fade-x -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <FilterChip
            v-for="b in WISH_BANNERS"
            :key="b.banner"
            radio
            :pressed="banner === b.banner"
            :count="counts[b.banner]"
            :title="b.title"
            @toggle="banner = b.banner"
            >{{ b.label }}</FilterChip
          >
        </div>

        <WishSummary :stats="stats" />

        <div class="grid gap-4 lg:grid-cols-2 lg:gap-6">
          <WishHighlights
            :rows="stats.fives"
            :rank="5"
            :banner="banner"
            :hard-pity="HARD_PITY[banner][0]"
            :limit="12"
          />
          <WishHighlights
            :rows="stats.fours"
            :rank="4"
            :banner="banner"
            :hard-pity="HARD_PITY[banner][1]"
            :limit="12"
          />
        </div>

        <WishList :rows="stats.rows" :banner="banner" />
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading" class="flex flex-col gap-4 lg:gap-6">
      <UiSkeleton class="h-10 w-full max-w-lg" />
      <div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <UiSkeleton v-for="n in 4" :key="n" class="h-[4.5rem]" />
      </div>
      <div class="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <UiSkeleton class="h-64" />
        <UiSkeleton class="h-64" />
      </div>
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
