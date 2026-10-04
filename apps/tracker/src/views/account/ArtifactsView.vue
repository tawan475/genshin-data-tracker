<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { refDebounced, useEventListener } from '@vueuse/core'
import { ChevronLeft, ChevronRight, Gem, SearchX } from 'lucide-vue-next'
import ArtifactCard from '@/components/artifacts/ArtifactCard.vue'
import ArtifactDetail from '@/components/artifacts/ArtifactDetail.vue'
import ArtifactPager from '@/components/artifacts/ArtifactPager.vue'
import ArtifactSetBreakdown from '@/components/artifacts/ArtifactSetBreakdown.vue'
import ArtifactSetsTable from '@/components/artifacts/ArtifactSetsTable.vue'
import ArtifactTable from '@/components/artifacts/ArtifactTable.vue'
import ArtifactToolbar from '@/components/artifacts/ArtifactToolbar.vue'
import ArtifactViewToggle from '@/components/artifacts/ArtifactViewToggle.vue'
import { SLOT_ICONS } from '@/components/artifacts/styles'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadLatestInventory } from '@/data/account-data'
import { MAIN_STAT_ORDER, formatSetName, formatSlotName } from '@/utils/artifact-stats'
import {
  SLOT_KEYS,
  activeFilterCount,
  bestPerSlot,
  buildArtifactRows,
  clearedFilters,
  compileFilter,
  cvRank,
  defaultDescending,
  facetCounts,
  isSpare,
  loadFilters,
  loadView,
  saveFilters,
  saveView,
  sortRows,
  summarizeSets,
  type ArtifactFilters,
  type ArtifactRow,
  type ArtifactSort,
  type ArtifactView,
  type SetOption,
  type SlotKey,
} from '@/data/artifacts'
import { useResource } from '@/data/use-resource'
import { formatNumber } from '@/lib/format'
import { useAccount } from './context'

/** Cards are tall, rows are not: a page of each fills a few screens. */
const PAGE_SIZE: Record<ArtifactView, number> = { cards: 60, table: 100, sets: Infinity }

const account = useAccount()
const inventory = useResource(
  () => account.value,
  (a) => loadLatestInventory(a),
)

/** Derived once per inventory (CV, RV, rolls, search text); cached by the data module. */
const rows = computed<ArtifactRow[]>(() =>
  inventory.data.value ? buildArtifactRows(inventory.data.value.good.artifacts) : [],
)

// ------------------------------------------------------------- filter state
// Per account, remembered on this device. Always replaced, never mutated, so
// a plain watch sees every change.
const filters = shallowRef<ArtifactFilters>(loadFilters(account.value.id))
watch(
  () => account.value.id,
  (id) => (filters.value = loadFilters(id)),
)
watch(filters, (value) => saveFilters(account.value.id, value))

// Typing should not re-filter 2,000 artifacts on every key.
const debouncedSearch = refDebounced(
  computed(() => filters.value.search),
  150,
)
const applied = computed<ArtifactFilters>(() => ({
  ...filters.value,
  search: debouncedSearch.value,
}))

// Filtering a sorted list keeps its order, so sorting only reruns on a sort change.
const sorted = computed(() => sortRows(rows.value, filters.value.sort, filters.value.descending))
const matches = computed(() => sorted.value.filter(compileFilter(applied.value)))
/** What the list shows: the matches, or with "Best" their top pieces per slot. */
const results = computed(() => (applied.value.best ? bestPerSlot(matches.value) : matches.value))

// ------------------------------------------------------------------ counts
const presetCounts = computed(() => {
  let fodder = 0
  let spare = 0
  let maxed = 0
  for (const row of rows.value) {
    if (row.fodder) fodder++
    if (isSpare(row)) spare++
    if (row.artifact.level >= 20) maxed++
  }
  return { fodder, spare, maxed }
})

const inventorySets = computed(() => {
  const keys = new Set<string>()
  for (const row of rows.value) keys.add(row.artifact.setKey)
  return keys
})
const setOptions = computed<SetOption[]>(() => {
  const counts = facetCounts(rows.value, applied.value, 'sets', (r) => r.artifact.setKey)
  const keys = new Set([...inventorySets.value, ...filters.value.sets])
  return [...keys].map((key) => ({ key, name: formatSetName(key), count: counts.get(key) ?? 0 }))
})
const slotCounts = computed(() =>
  facetCounts(rows.value, applied.value, 'slots', (r) => r.artifact.slotKey),
)
const rarityCounts = computed(() =>
  facetCounts(rows.value, applied.value, 'rarities', (r) => r.artifact.rarity),
)
const rarities = computed(() => {
  const present = new Set<number>(filters.value.rarities)
  for (const row of rows.value) present.add(row.artifact.rarity)
  return [...present].sort((a, b) => b - a)
})
const mainStats = computed(() => {
  const counts = facetCounts(rows.value, applied.value, 'mainStat', (r) => r.artifact.mainStatKey)
  const keys = new Set<string>()
  for (const row of rows.value) keys.add(row.artifact.mainStatKey)
  if (filters.value.mainStat) keys.add(filters.value.mainStat)
  const rank = (key: string) => {
    const index = MAIN_STAT_ORDER.indexOf(key)
    return index === -1 ? MAIN_STAT_ORDER.length : index
  }
  return [...keys]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => ({ key, count: counts.get(key) ?? 0 }))
})

/** Sets among the current matches, biggest first. */
const matchSets = computed<SetOption[]>(() => {
  const counts = new Map<string, number>()
  for (const row of matches.value) {
    counts.set(row.artifact.setKey, (counts.get(row.artifact.setKey) ?? 0) + 1)
  }
  return [...counts]
    .map(([key, count]) => ({ key, name: formatSetName(key), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const filtering = computed(() => activeFilterCount(applied.value) > 0)

function toggleSet(key: string) {
  const sets = filters.value.sets
  filters.value = {
    ...filters.value,
    sets: sets.includes(key) ? sets.filter((k) => k !== key) : [...sets, key],
  }
}

function clearFilters() {
  filters.value = clearedFilters(filters.value)
}

// -------------------------------------------------------------------- views
const view = ref<ArtifactView>(loadView())
watch(view, saveView)

/** Table headers: the active column flips direction, another starts in its natural one. */
function sortBy(sort: ArtifactSort) {
  const f = filters.value
  filters.value =
    f.sort === sort
      ? { ...f, descending: !f.descending }
      : { ...f, sort, descending: defaultDescending(sort) }
}

/** Only built while the Sets view is open. */
const setSummaries = computed(() => (view.value === 'sets' ? summarizeSets(matches.value) : []))

/** From the Sets view: show that set (and slot) as cards. */
function pickSet(setKey: string, slot?: SlotKey) {
  filters.value = { ...filters.value, sets: [setKey], slots: slot ? [slot] : [] }
  view.value = 'cards'
}

// --------------------------------------------------------------- pagination
const page = ref(1)
const pageSize = computed(() => PAGE_SIZE[view.value])
const pageCount = computed(() => Math.max(1, Math.ceil(results.value.length / pageSize.value)))
watch([results, view], () => (page.value = 1))
const pageRows = computed(() =>
  results.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value),
)

const resultsTop = useTemplateRef<HTMLElement>('resultsTop')
async function goToPage(n: number) {
  page.value = n
  await nextTick()
  const top = resultsTop.value
  if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' })
}

/** Cards, split by slot while "Best" groups them. */
const cardGroups = computed(() => {
  if (!applied.value.best) return [{ slot: '', rows: pageRows.value }]
  const groups = new Map<string, ArtifactRow[]>()
  for (const row of pageRows.value) {
    const list = groups.get(row.artifact.slotKey)
    if (list) list.push(row)
    else groups.set(row.artifact.slotKey, [row])
  }
  return [...groups].map(([slot, list]) => ({ slot, rows: list }))
})

// ------------------------------------------------------------------- detail
const openId = ref<number | null>(null)
watch(rows, () => (openId.value = null))
const openRow = computed(() => (openId.value === null ? null : (rows.value[openId.value] ?? null)))
const openIndex = computed(() => (openRow.value ? results.value.indexOf(openRow.value) : -1))
const openRank = computed(() => (openRow.value ? cvRank(rows.value, openRow.value) : undefined))

function step(delta: number) {
  const index = openIndex.value + delta
  const next = results.value[index]
  if (!next) return
  openId.value = next.id
  // Keep the piece on the page behind the dialog.
  if (Number.isFinite(pageSize.value)) page.value = Math.floor(index / pageSize.value) + 1
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (openRow.value === null || event.altKey || event.ctrlKey || event.metaKey) return
  if (event.key === 'ArrowRight') step(1)
  else if (event.key === 'ArrowLeft') step(-1)
  else return
  event.preventDefault()
})

const GRID =
  'grid grid-cols-1 gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 @7xl:grid-cols-5'
</script>

<template>
  <PageHeader title="Artifacts" />

  <UiEmpty v-if="!account.latest" title="No snapshot yet">
    <template #icon><Gem aria-hidden="true" /></template>
    <UiButton variant="primary" :to="{ name: 'account-import' }">Import</UiButton>
  </UiEmpty>

  <UiError
    v-else-if="inventory.error.value && !inventory.data.value"
    title="Could not load artifacts"
    :error="inventory.error.value"
    @retry="inventory.reload()"
  />

  <div v-else-if="!inventory.data.value" class="flex flex-col gap-4" aria-busy="true">
    <span class="sr-only" role="status">Loading artifacts</span>
    <UiSkeleton class="h-28" />
    <UiSkeleton class="h-11 w-64" />
    <div class="@container">
      <div :class="GRID">
        <div
          v-for="n in 8"
          :key="n"
          class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
        >
          <div class="flex gap-3">
            <UiSkeleton class="size-12 shrink-0" />
            <div class="flex flex-1 flex-col gap-2">
              <UiSkeleton class="h-5 w-2/3" />
              <UiSkeleton class="h-4 w-1/2" />
            </div>
          </div>
          <UiSkeleton v-for="line in 4" :key="line" class="h-4" />
          <UiSkeleton class="h-9" />
        </div>
      </div>
    </div>
  </div>

  <UiEmpty v-else-if="rows.length === 0" title="No artifacts">
    <template #icon><Gem aria-hidden="true" /></template>
    <UiButton variant="primary" :to="{ name: 'account-import' }">Import</UiButton>
  </UiEmpty>

  <div v-else class="flex flex-col gap-4">
    <UiError
      v-if="inventory.error.value"
      title="Could not refresh"
      :error="inventory.error.value"
      @retry="inventory.reload()"
    />

    <ArtifactToolbar
      v-model="filters"
      :sets="setOptions"
      :slot-counts="slotCounts"
      :rarities="rarities"
      :rarity-counts="rarityCounts"
      :main-stats="mainStats"
      :fodder-count="presetCounts.fodder"
      :spare-count="presetCounts.spare"
      :maxed-count="presetCounts.maxed"
    />

    <div ref="resultsTop" class="flex min-w-0 scroll-mt-20 items-center gap-3">
      <p
        class="tabular shrink-0 font-mono text-lg"
        role="status"
        :title="filtering ? 'Shown / artifacts' : 'Artifacts'"
      >
        <template v-if="filtering">
          {{ formatNumber(view === 'sets' ? matches.length : results.length)
          }}<span class="text-text-muted"> / {{ formatNumber(rows.length) }}</span>
        </template>
        <template v-else>{{ formatNumber(rows.length) }}</template>
        <span class="sr-only">artifacts</span>
      </p>
      <ArtifactSetBreakdown
        v-if="view !== 'sets' && (matchSets.length > 1 || filters.sets.length)"
        class="flex-1"
        :sets="matchSets"
        :selected="filters.sets"
        @toggle="toggleSet"
      />
      <ArtifactViewToggle v-model="view" class="ml-auto" />
    </div>

    <UiEmpty v-if="results.length === 0" title="No matches">
      <template #icon><SearchX aria-hidden="true" /></template>
      <UiButton variant="primary" @click="clearFilters">Clear filters</UiButton>
    </UiEmpty>

    <ArtifactSetsTable v-else-if="view === 'sets'" :sets="setSummaries" @pick="pickSet" />

    <template v-else>
      <ArtifactTable
        v-if="view === 'table'"
        :rows="pageRows"
        :sort="filters.sort"
        :descending="filters.descending"
        @open="openId = $event"
        @sort="sortBy"
      />

      <div v-else class="@container flex flex-col gap-4">
        <section
          v-for="group in cardGroups"
          :key="group.slot"
          class="flex flex-col gap-2"
          :aria-label="group.slot ? formatSlotName(group.slot) : undefined"
        >
          <h2
            v-if="group.slot"
            class="flex items-center gap-2 text-sm font-medium text-text-secondary"
          >
            <component
              :is="SLOT_ICONS[group.slot as SlotKey]"
              v-if="SLOT_KEYS.includes(group.slot as SlotKey)"
              class="size-4"
              aria-hidden="true"
            />
            {{ formatSlotName(group.slot) }}
          </h2>
          <ul :class="GRID">
            <li v-for="row in group.rows" :key="row.id" class="flex">
              <ArtifactCard :row="row" class="flex-1" @open="openId = $event" />
            </li>
          </ul>
        </section>
      </div>

      <ArtifactPager
        v-if="pageCount > 1"
        :model-value="page"
        :page-count="pageCount"
        :page-size="pageSize"
        :total="results.length"
        @update:model-value="goToPage"
      />
    </template>
  </div>

  <UiModal :open="openRow !== null" :title="openRow?.setName ?? ''" wide @close="openId = null">
    <ArtifactDetail v-if="openRow" :row="openRow" :rank="openRank" />
    <template #footer>
      <span
        v-if="openIndex >= 0"
        class="tabular mr-auto self-center font-mono text-sm text-text-muted"
        title="← →"
      >
        {{ formatNumber(openIndex + 1) }} / {{ formatNumber(results.length) }}
      </span>
      <UiIconButton
        label="Previous"
        class="disabled:opacity-40"
        :disabled="openIndex <= 0"
        @click="step(-1)"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton
        label="Next"
        class="disabled:opacity-40"
        :disabled="openIndex < 0 || openIndex >= results.length - 1"
        @click="step(1)"
      >
        <ChevronRight class="size-5" aria-hidden="true" />
      </UiIconButton>
    </template>
  </UiModal>
</template>
