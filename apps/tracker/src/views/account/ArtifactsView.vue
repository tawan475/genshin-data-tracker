<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { ChevronLeft, ChevronRight, Gem, SearchX } from 'lucide-vue-next'
import ArtifactCard from '@/components/artifacts/ArtifactCard.vue'
import ArtifactDetail from '@/components/artifacts/ArtifactDetail.vue'
import ArtifactSetBreakdown from '@/components/artifacts/ArtifactSetBreakdown.vue'
import ArtifactToolbar from '@/components/artifacts/ArtifactToolbar.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadLatestInventory } from '@/data/account-data'
import { MAIN_STAT_ORDER, formatSetName } from '@/utils/artifact-stats'
import {
  activeFilterCount,
  buildArtifactRows,
  clearedFilters,
  compileFilter,
  facetCounts,
  loadFilters,
  saveFilters,
  sortRows,
  type ArtifactFilters,
  type ArtifactRow,
  type SetOption,
} from '@/data/artifacts'
import { useResource } from '@/data/use-resource'
import { formatNumber } from '@/lib/format'
import { useAccount } from './context'

const PAGE_SIZE = 120

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

// ------------------------------------------------------------------ counts
const fodderTotal = computed(() => rows.value.reduce((n, row) => n + Number(row.fodder), 0))

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

// ---------------------------------------------------------------- windowing
const limit = ref(PAGE_SIZE)
watch(matches, () => (limit.value = PAGE_SIZE))
const shown = computed(() => matches.value.slice(0, limit.value))
const remaining = computed(() => matches.value.length - shown.value.length)

// ------------------------------------------------------------------- detail
const openId = ref<number | null>(null)
watch(rows, () => (openId.value = null))
const openRow = computed(() => (openId.value === null ? null : (rows.value[openId.value] ?? null)))
const openIndex = computed(() => (openRow.value ? matches.value.indexOf(openRow.value) : -1))

function step(delta: number) {
  const next = matches.value[openIndex.value + delta]
  if (!next) return
  openId.value = next.id
  // Keep the card on the page behind the dialog.
  if (openIndex.value >= limit.value) limit.value = openIndex.value + 1
}
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
      <div class="grid grid-cols-1 gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
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
      :fodder-count="fodderTotal"
    />

    <div class="flex min-w-0 items-center gap-3">
      <p
        class="tabular shrink-0 font-mono text-lg"
        role="status"
        :title="filtering ? 'Matches / artifacts' : 'Artifacts'"
      >
        <template v-if="filtering">
          {{ formatNumber(matches.length)
          }}<span class="text-text-muted"> / {{ formatNumber(rows.length) }}</span>
        </template>
        <template v-else>{{ formatNumber(rows.length) }}</template>
        <span class="sr-only">artifacts</span>
      </p>
      <ArtifactSetBreakdown
        v-if="matchSets.length > 1 || filters.sets.length"
        class="flex-1"
        :sets="matchSets"
        :selected="filters.sets"
        @toggle="toggleSet"
      />
    </div>

    <UiEmpty v-if="matches.length === 0" title="No matches">
      <template #icon><SearchX aria-hidden="true" /></template>
      <UiButton variant="primary" @click="clearFilters">Clear filters</UiButton>
    </UiEmpty>

    <template v-else>
      <div class="@container">
        <ul class="grid grid-cols-1 gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
          <li v-for="row in shown" :key="row.id" class="flex">
            <ArtifactCard :row="row" class="flex-1" @open="openId = $event" />
          </li>
        </ul>
      </div>

      <div v-if="remaining > 0" class="flex items-center justify-center gap-3">
        <span class="tabular font-mono text-sm text-text-muted">
          {{ formatNumber(shown.length) }} / {{ formatNumber(matches.length) }}
        </span>
        <UiButton @click="limit += PAGE_SIZE">Show more</UiButton>
      </div>
    </template>
  </div>

  <UiModal :open="openRow !== null" :title="openRow?.setName ?? ''" wide @close="openId = null">
    <ArtifactDetail v-if="openRow" :row="openRow" />
    <template #footer>
      <span
        v-if="openIndex >= 0"
        class="tabular mr-auto self-center font-mono text-sm text-text-muted"
      >
        {{ formatNumber(openIndex + 1) }} / {{ formatNumber(matches.length) }}
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
        :disabled="openIndex < 0 || openIndex >= matches.length - 1"
        @click="step(1)"
      >
        <ChevronRight class="size-5" aria-hidden="true" />
      </UiIconButton>
    </template>
  </UiModal>
</template>
