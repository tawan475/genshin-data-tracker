<script lang="ts">
import type { AccountRef } from '@/data/account-data'
import {
  loadMaterialsHistory as loadHistory,
  type MaterialsHistory as History,
} from '@/data/materials'
import { loadMaterialMeta as loadMeta } from '@/components/materials-page/material-meta'
import { preloadMaterialRarities as preloadRarities } from '@/utils/materials'

type MaterialsLoad = { accountId: number; history: History | null }
/** The page's loads, kept across visits (a few accounts' worth). */
const materialsLoads = new Map<string, Promise<MaterialsLoad>>()
async function loadMaterials(
  a: AccountRef & { latest: { id: number } | null },
): Promise<MaterialsLoad> {
  if (!a.latest) return { accountId: a.id, history: null }
  const [history] = await Promise.all([loadHistory(a), loadMeta(), preloadRarities()])
  return { accountId: a.id, history }
}
</script>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { Clock, Package, Upload } from 'lucide-vue-next'
import { useChartRange } from '@/components/charts/use-chart-range'
import MaterialDetail from '@/components/materials-page/MaterialDetail.vue'
import MaterialsBag from '@/components/materials-page/MaterialsBag.vue'
import ItemPopover from '@/components/planner/ItemPopover.vue'
import { adjustmentApplies } from '@/components/planner/hand-edits'
import { usePlannerModel } from '@/components/planner/use-planner-model'
import TrackedPanel from '@/components/materials-page/TrackedPanel.vue'
import TrackPicker from '@/components/materials-page/TrackPicker.vue'
import WalletStrip, { type WalletItem } from '@/components/materials-page/WalletStrip.vue'
import {
  buildItems,
  materialItem,
  type MaterialItem,
} from '@/components/materials-page/material-items'
import {
  bagTabs,
  loadMaterialMeta,
  WALLET_KEYS,
  WALLET_LABELS,
} from '@/components/materials-page/material-meta'
import {
  changesSince,
  isChangePeriod,
  CHANGE_SINCE_OPTIONS,
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
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadMaterialsHistory, type MaterialsHistory } from '@/data/materials'
import { useResource } from '@/data/use-resource'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { preloadMaterialNames, preloadMaterialRarities } from '@/utils/materials'
import { useAccount, useReadOnly } from './context'

/**
 * Materials: the wallet (currencies) on top, tracked materials as small
 * charts, then the bag, everything held in the in-game Inventory's tabs and
 * order. All from the materials sections of the account's snapshots,
 * decoded once per data version. A material the Planner knows opens its
 * inventory editor (the Planner's: counts set by hand on top of the
 * capture, what the goals need, a link to the history); anything else
 * opens the detail view with its history.
 */
const account = useAccount()
/** Staff Inspect: no Planner, no saved charts, no import. */
const readOnly = useReadOnly()
const icon = useMaterialIcons()
const graph = useMaterialsGraph(() => account.value.id)

// The game's names load alongside (their own chunk, not waited for): until
// they are in, names are the keys' words, and everything showing one updates.
void preloadMaterialNames()

// Tagged with the account id, so switching accounts shows a skeleton rather
// than the previous account's materials while the next one loads. The index
// (rarities) is the chunk the bag's order already waits for.
// One promise per account data version, so coming back to the page shows the
// bag on its first frame (use-resource reads a settled promise at once).
const resource = useResource(
  () => account.value,
  (a) => {
    const key = `${(a as AccountRef).source ?? 'own'}:${a.id}:${a.dataVersion}`
    let entry = materialsLoads.get(key)
    if (!entry) {
      entry = loadMaterials(a)
      entry.catch(() => materialsLoads.delete(key))
      materialsLoads.set(key, entry)
      while (materialsLoads.size > 8) materialsLoads.delete(materialsLoads.keys().next().value!)
    }
    return entry
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

// ------------------------------------------------------------------ inventory editor

const planning = readOnly ? null : usePlannerModel(account)
const editor = shallowRef<{ key: string; anchor: HTMLElement; touch: boolean } | null>(null)
const editorOpen = ref(false)

/** Counts set by hand that differ from the capture's (the bag shows them). */
const edited = computed(() => {
  const map = new Map<string, number>()
  if (!planning) return map
  const bag = planning.bag.value
  const good = planning.good.value
  const edits = planning.state.adjustments.value
  if (!bag || !good || !edits) return map
  for (const edit of edits) {
    if (!adjustmentApplies(edit, planning.base.value)) continue
    const count = bag[edit.key] ?? 0
    if (count !== (good.materials[edit.key] ?? 0)) map.set(edit.key, count)
  }
  return map
})

function openTile(key: string, anchor: HTMLElement, touch: boolean) {
  const known = planning?.planner.value?.materialsByKey.has(key)
  if (planning && known && planning.bag.value && planning.totals.value) {
    editor.value = { key, anchor, touch }
    editorOpen.value = true
  } else detailKey.value = key
}

function showHistory(key: string) {
  editorOpen.value = false
  detailKey.value = key
}

// ------------------------------------------------------------------ tracked

const range = useChartRange('materials:range')
const frame = computed(() => (history.value ? rangeFrame(history.value, range.value) : null))
const canTrack = computed(() => graph.selectedKeys.value.length < MAX_SERIES)

const detailKey = shallowRef<string | null>(null)
// A tracked key this account never held still opens (at 0).
const detailItem = computed<MaterialItem | null>(() => {
  const key = detailKey.value
  if (!key) return null
  return byKey.value.get(key) ?? materialItem(key, 0)
})
const pickerOpen = ref(false)

watch(
  () => account.value.id,
  () => {
    detailKey.value = null
    pickerOpen.value = false
    editorOpen.value = false
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
        <UiSelect
          v-model="period"
          :options="CHANGE_SINCE_OPTIONS"
          aria-label="Change since"
          class="w-[5.75rem] shrink-0"
        />
      </span>
    </template>
  </PageHeader>

  <UiPanel v-if="!account.latest" flush>
    <UiEmpty title="No snapshots yet">
      <template #icon><Package aria-hidden="true" /></template>
      <UiButton v-if="!readOnly" variant="primary" :to="importTo">
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
      v-model:range="range"
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
      :tabs="bagTabs()"
      :changes="changes"
      :compared="reference !== null"
      :hint="hint"
      :tracked="graph.selectedKeys.value"
      :icon="icon"
      :import-to="importTo"
      :edited="edited"
      @open="openTile"
    />

    <MaterialDetail
      v-model:range="range"
      :item="detailItem"
      :history="history"
      :icon="icon"
      :tracked="detailItem ? graph.isSelected(detailItem.key) : false"
      :can-track="canTrack"
      @close="detailKey = null"
      @toggle-track="graph.toggle"
    />

    <ItemPopover
      v-if="planning && planning.planner.value && planning.bag.value && planning.good.value"
      :open="editorOpen"
      :anchor="editor?.anchor ?? null"
      :item-key="editor?.key ?? null"
      :context="null"
      :touch="editor?.touch ?? false"
      :planner="planning.planner.value"
      :bag="planning.bag.value"
      :capture="planning.good.value.materials"
      :totals="planning.totals.value"
      history
      @close="editorOpen = false"
      @change="planning.setCount"
      @add="planning.addCount"
      @history="showHistory"
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
          class="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] sm:gap-2"
        >
          <UiSkeleton v-for="n in 36" :key="n" class="aspect-[4/5]" />
        </div>
      </div>
    </UiPanel>
  </div>
</template>
