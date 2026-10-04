<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Clock, Package, Upload } from 'lucide-vue-next'
import MaterialDetail from '@/components/materials-page/MaterialDetail.vue'
import MaterialsBag from '@/components/materials-page/MaterialsBag.vue'
import TrackedPanel from '@/components/materials-page/TrackedPanel.vue'
import TrackPicker from '@/components/materials-page/TrackPicker.vue'
import WalletStrip, { type WalletItem } from '@/components/materials-page/WalletStrip.vue'
import { buildItems, type MaterialItem } from '@/components/materials-page/material-items'
import {
  loadMaterialMeta,
  materialMeta,
  WALLET,
  WALLET_KEYS,
  WALLET_LABELS,
} from '@/components/materials-page/material-meta'
import {
  changesSince,
  isChangePeriod,
  PERIOD_OPTIONS,
  rangeFrame,
  referenceFor,
  type ChangePeriod,
} from '@/components/materials-page/material-stats'
import { useMaterialIcons } from '@/components/materials/use-material-icons'
import { MAX_SERIES, useMaterialsGraph } from '@/components/materials/use-materials-graph'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadMaterialsHistory, type MaterialsHistory } from '@/data/materials'
import { useResource } from '@/data/use-resource'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialName } from '@/utils/materials'
import { useAccount } from './context'

/**
 * Materials: the wallet (currencies) on top, tracked materials as small
 * charts, then the bag, an icon grid of everything held. Any material opens
 * a detail view with its history. All from the materials sections of the
 * account's snapshots, decoded once per data version.
 */
const account = useAccount()
const icon = useMaterialIcons()
const graph = useMaterialsGraph(() => account.value.id)

// Tagged with the account id, so switching accounts shows a skeleton rather
// than the previous account's materials while the next one loads.
const resource = useResource(
  () => account.value,
  async (a): Promise<{ accountId: number; history: MaterialsHistory | null }> => {
    if (!a.latest) return { accountId: a.id, history: null }
    const [history] = await Promise.all([loadMaterialsHistory(a), loadMaterialMeta()])
    return { accountId: a.id, history }
  },
)
const history = computed(() => {
  const value = resource.data.value
  return value && value.accountId === account.value.id ? value.history : undefined
})

// ------------------------------------------------------------------ changes

const PERIOD_KEY = 'materials:period'
const storedPeriod = readStorage(PERIOD_KEY)
const period = ref<ChangePeriod>(isChangePeriod(storedPeriod) ? storedPeriod : '7d')
watch(period, (value) => writeStorage(PERIOD_KEY, value))

const reference = computed(() => (history.value ? referenceFor(history.value, period.value) : null))
const changes = computed(() =>
  history.value ? changesSince(history.value, reference.value) : new Map<string, number>(),
)
const hint = computed(() =>
  reference.value ? `since ${formatDate(reference.value.takenAt)}` : 'One snapshot only',
)

// ------------------------------------------------------------------ materials

const items = computed(() => (history.value ? buildItems(history.value) : []))
const byKey = computed(() => new Map(items.value.map((item) => [item.key, item])))

const wallet = computed<WalletItem[]>(() => {
  const list: WalletItem[] = []
  for (const key of WALLET_KEYS) {
    const item = byKey.value.get(key)
    // Mora and Primogems always; the rest only while held.
    if (!item || (item.count === 0 && key !== 'Mora' && key !== 'Primogem')) continue
    list.push({
      key,
      label: WALLET_LABELS[key] ?? item.name,
      name: item.name,
      count: item.count,
      change: reference.value ? (changes.value.get(key) ?? 0) : null,
    })
  }
  return list
})

const newest = computed(() => {
  const times = history.value?.times
  const at = times?.[times.length - 1]
  return at === undefined
    ? null
    : { iso: new Date(at).toISOString(), ago: formatRelative(at), title: formatDateTime(at) }
})

// ------------------------------------------------------------------ tracked

const frame = computed(() => (history.value ? rangeFrame(history.value, graph.range.value) : null))
const canTrack = computed(() => graph.selectedKeys.value.length < MAX_SERIES)

const detailKey = shallowRef<string | null>(null)
// A tracked key this account never held still opens (at 0).
const detailItem = computed<MaterialItem | null>(() => {
  const key = detailKey.value
  if (!key) return null
  const meta = materialMeta(key)
  return (
    byKey.value.get(key) ?? {
      key,
      name: materialName(key),
      kind: meta.kind,
      order: meta.order,
      count: 0,
      wallet: WALLET.has(key),
    }
  )
})
const pickerOpen = ref(false)

watch(
  () => account.value.id,
  () => {
    detailKey.value = null
    pickerOpen.value = false
  },
)

const importTo = computed(() => ({
  name: 'account-import',
  params: { accountId: account.value.id },
}))
</script>

<template>
  <PageHeader title="Materials">
    <template v-if="newest" #meta>
      <p class="flex items-center gap-1.5 text-text-secondary">
        <Clock class="size-4" aria-hidden="true" />
        <span class="sr-only">Newest snapshot</span>
        <time :datetime="newest.iso" :title="newest.title">{{ newest.ago }}</time>
      </p>
    </template>
    <template v-if="history" #actions>
      <span :title="`Changes ${hint}`">
        <UiSegmented v-model="period" :options="PERIOD_OPTIONS" label="Change since" />
      </span>
    </template>
  </PageHeader>

  <UiPanel v-if="!account.latest" flush>
    <UiEmpty title="No snapshots yet">
      <template #icon><Package aria-hidden="true" /></template>
      <UiButton variant="primary" :to="importTo">
        <Upload class="size-4" aria-hidden="true" />
        Import
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <UiError
    v-else-if="resource.error.value && !history"
    title="Could not load materials"
    :error="resource.error.value"
    @retry="resource.reload"
  />

  <div v-else-if="history && frame" class="flex flex-col gap-6">
    <WalletStrip
      v-if="wallet.length"
      :items="wallet"
      :icon="icon"
      :hint="hint"
      @open="detailKey = $event"
    />

    <TrackedPanel
      v-model:range="graph.range.value"
      :history="history"
      :frame="frame"
      :keys="graph.selectedKeys.value"
      :ready="graph.ready.value"
      :icon="icon"
      @open="detailKey = $event"
      @remove="graph.remove"
      @add="pickerOpen = true"
    />

    <MaterialsBag
      :items="items"
      :changes="changes"
      :compared="reference !== null"
      :hint="hint"
      :tracked="graph.selectedKeys.value"
      :icon="icon"
      :import-to="importTo"
      @open="detailKey = $event"
    />

    <MaterialDetail
      v-model:range="graph.range.value"
      :item="detailItem"
      :history="history"
      :icon="icon"
      :tracked="detailItem ? graph.isSelected(detailItem.key) : false"
      :can-track="canTrack"
      @close="detailKey = null"
      @toggle-track="graph.toggle"
    />

    <TrackPicker
      :open="pickerOpen"
      :items="items"
      :selected="graph.selectedKeys.value"
      :changes="changes"
      :hint="hint"
      :icon="icon"
      @close="pickerOpen = false"
      @toggle="graph.toggle"
    />
  </div>

  <div v-else class="flex flex-col gap-6" aria-busy="true" aria-label="Loading materials">
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <UiSkeleton v-for="n in 8" :key="n" class="h-[4.25rem]" />
    </div>
    <UiPanel>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UiSkeleton v-for="n in 2" :key="n" class="h-52" />
      </div>
    </UiPanel>
    <UiPanel>
      <div class="flex flex-col gap-4">
        <UiSkeleton class="h-10 w-full" />
        <div
          class="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]"
        >
          <UiSkeleton v-for="n in 36" :key="n" class="aspect-[4/5]" />
        </div>
      </div>
    </UiPanel>
  </div>
</template>
