<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import ArtifactListCard from '@/components/artifact-list/ArtifactListCard.vue'
import { getSubstatColorClass, hideBrokenImage } from '@/components/artifact-list/styles'
import BasePagination, { type PaginationMeta } from '@/components/legacy/BasePagination.vue'
import BaseTable, { type TableLabel } from '@/components/legacy/BaseTable.vue'
import UiError from '@/components/ui/UiError.vue'
import { loadLatestInventory } from '@/data/account-data'
import { buildArtifactRows, sortRows, type ArtifactRow } from '@/data/artifacts'
import { useResource } from '@/data/use-resource'
import { artifactIcon } from '@/lib/assets'
import { useAccounts } from '@/stores/accounts'
import { formatStatName, formatStatValue } from '@/utils/artifact-stats'
import { useAccount } from './context'

/**
 * "My Artifacts" from the original dashboard: every artifact in the newest
 * snapshot, sorted by crit or roll value, as cards or a table. The old API
 * paged and searched on the server; here the decoded snapshot is filtered
 * and paged in the browser.
 */
type SortBy = 'cv' | 'rv'

const sortByOptions: Record<SortBy, string> = { cv: 'Crit Value', rv: 'Roll Value' }
const cardLimitOptions = [12, 24, 48, 96]

const account = useAccount()
const accounts = useAccounts()
const inventory = useResource(
  () => account.value,
  (a) => loadLatestInventory(a),
)

const sortBy = ref<SortBy>('cv')
const search = ref('')
const viewMode = ref<'cards' | 'table'>('cards')
const page = ref(1)
const limit = ref(24)
const cardsAnchor = ref<HTMLElement | null>(null)
const tableAnchor = ref<HTMLElement | null>(null)

const debouncedSearch = refDebounced(search, 300)

/** `undefined` until the first load; `null` inventory means no snapshot yet. */
const loaded = computed(() => inventory.data.value !== undefined)
const isLoading = computed(() => inventory.loading.value)
const accountName = computed(() => accounts.displayName(account.value))

const rows = computed<ArtifactRow[]>(() =>
  inventory.data.value ? buildArtifactRows(inventory.data.value.good.artifacts) : [],
)
const sorted = computed(() => sortRows(rows.value, sortBy.value, true))
/** Set name or GOOD set key, case-insensitive (the old API matched the key). */
const matches = computed(() => {
  const query = debouncedSearch.value.trim().toLowerCase()
  if (!query) return sorted.value
  return sorted.value.filter(
    (row) =>
      row.setName.toLowerCase().includes(query) ||
      row.artifact.setKey.toLowerCase().includes(query),
  )
})

const meta = computed<PaginationMeta>(() => ({
  page: page.value,
  limit: limit.value,
  total: matches.value.length,
  totalPages: Math.max(1, Math.ceil(matches.value.length / limit.value)),
}))
const artifacts = computed(() =>
  matches.value.slice((page.value - 1) * limit.value, page.value * limit.value),
)

watch([sortBy, debouncedSearch, () => account.value.id], () => (page.value = 1))
watch(
  () => meta.value.totalPages,
  (pages) => {
    if (page.value > pages) page.value = pages
  },
)

function setPage(value: number) {
  page.value = value
}

function setLimit(value: number) {
  limit.value = value
  page.value = 1
}

const tableLabels: TableLabel[] = [
  { key: 'id', title: 'ID', slot: true },
  { key: 'setKey', title: 'Set', slot: true },
  { key: 'slotKey', title: 'Slot', slot: true },
  { key: 'level', title: 'Level', slot: true },
  { key: 'mainStat', title: 'Main Stat', slot: true },
  { key: 'substats', title: 'Substats', slot: true },
  { key: 'cv', title: 'CV', slot: true },
  { key: 'rv', title: 'RV', slot: true },
]
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-6 pb-12">
    <div
      class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-700"
    >
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          My Artifacts
        </h1>
        <p class="text-slate-500 dark:text-slate-400 mt-1">
          Found {{ meta.total }} artifacts for {{ accountName }}
        </p>
      </div>

      <div class="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
        <div class="relative w-full sm:w-64">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              class="h-5 w-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            v-model="search"
            type="text"
            placeholder="Search artifacts..."
            aria-label="Search artifacts"
            class="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
          />
        </div>

        <select
          v-model="sortBy"
          aria-label="Sort by"
          class="block w-full sm:w-40 pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
        >
          <option v-for="(label, value) in sortByOptions" :key="value" :value="value">
            {{ label }}
          </option>
        </select>

        <div
          class="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden shrink-0"
        >
          <button
            type="button"
            :aria-pressed="viewMode === 'cards'"
            :class="[
              'flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-colors',
              viewMode === 'cards'
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
            ]"
            @click="viewMode = 'cards'"
          >
            Cards
          </button>
          <button
            type="button"
            :aria-pressed="viewMode === 'table'"
            :class="[
              'flex-1 sm:flex-none px-3 py-2 text-sm font-medium transition-colors border-l border-slate-300 dark:border-slate-600',
              viewMode === 'table'
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
            ]"
            @click="viewMode = 'table'"
          >
            Table
          </button>
        </div>
      </div>
    </div>

    <UiError
      v-if="inventory.error.value"
      title="Could not load artifacts"
      :error="inventory.error.value"
      @retry="inventory.reload()"
    />

    <div v-if="!loaded" class="flex justify-center p-12">
      <span
        v-if="isLoading"
        class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"
      />
    </div>

    <template v-else-if="viewMode === 'cards'">
      <div
        v-if="artifacts.length === 0"
        class="text-center p-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
      >
        <p class="text-slate-500 dark:text-slate-400">No artifacts found.</p>
      </div>
      <div v-else ref="cardsAnchor" class="relative">
        <div
          v-if="isLoading"
          class="absolute inset-0 z-10 flex justify-center items-start pt-12 bg-white/40 dark:bg-slate-900/40 backdrop-blur-[1px] rounded-lg"
        >
          <span
            class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"
          />
        </div>
        <div
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3"
        >
          <ArtifactListCard v-for="row in artifacts" :key="row.id" :row="row" />
        </div>
      </div>

      <BasePagination
        v-if="artifacts.length > 0"
        :meta="meta"
        :is-loading="isLoading"
        :scroll-anchor="cardsAnchor"
        :limit-options="cardLimitOptions"
        @page-change="setPage"
        @limit-change="setLimit"
      />
    </template>

    <template v-else>
      <div ref="tableAnchor">
        <BaseTable :labels="tableLabels" :data="artifacts" :is-loading="isLoading">
          <template #id="{ item }">
            <span class="tabular-nums">{{ item.id + 1 }}</span>
          </template>
          <template #setKey="{ item }">
            <div class="flex items-center gap-2">
              <img
                v-if="artifactIcon(item.artifact.setKey, item.artifact.slotKey)"
                :src="artifactIcon(item.artifact.setKey, item.artifact.slotKey)"
                :alt="item.setName"
                class="w-8 h-8 object-contain rounded bg-slate-100 dark:bg-slate-800"
                loading="lazy"
                @error="hideBrokenImage"
              />
              <span class="font-medium">{{ item.setName }}</span>
            </div>
          </template>
          <template #slotKey="{ item }">
            <span
              class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              {{ item.artifact.slotKey }}
            </span>
          </template>
          <template #level="{ item }">
            <span
              class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            >
              +{{ item.artifact.level }}
            </span>
          </template>
          <template #mainStat="{ item }">
            <span class="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
              {{ formatStatName(item.artifact.mainStatKey) }}
            </span>
          </template>
          <template #substats="{ item }">
            <div class="flex flex-col gap-1 min-w-[150px] py-2">
              <div
                v-for="sub in item.artifact.substats"
                :key="sub.key"
                class="flex justify-between items-center gap-3 text-xs"
              >
                <span class="text-slate-600 dark:text-slate-300 whitespace-nowrap">{{
                  formatStatName(sub.key)
                }}</span>
                <span :class="['font-bold', getSubstatColorClass(sub.key)]">
                  +{{ formatStatValue(sub.key, sub.value) }}
                </span>
              </div>
            </div>
          </template>
          <template #cv="{ item }">
            <span class="font-bold text-slate-900 dark:text-white">{{ item.cv.toFixed(1) }}</span>
          </template>
          <template #rv="{ item }">
            <span class="font-bold text-slate-900 dark:text-white">{{ item.rv }}%</span>
          </template>
        </BaseTable>
      </div>

      <BasePagination
        v-if="artifacts.length > 0"
        :meta="meta"
        :is-loading="isLoading"
        :scroll-anchor="tableAnchor"
        :limit-options="cardLimitOptions"
        @page-change="setPage"
        @limit-change="setLimit"
      />
    </template>
  </div>
</template>
