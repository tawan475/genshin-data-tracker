<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import BaseTable, { type TableLabel, type PaginationMeta } from '../../components/BaseTable.vue'
import BasePagination from '../../components/BasePagination.vue'
import ArtifactCard from '../../components/ArtifactCard.vue'
import { getArtifactIconUrl, onImageFallback } from '../../utils/assets'
import {
  type ArtifactCardData,
  formatSetName,
  formatStatName,
  formatStatValue,
  getSubstatColorClass,
} from '../../utils/artifact-stats'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()

const artifacts = ref<ArtifactCardData[]>([])
const isLoading = ref(true)
const sortBy = ref<string>('cv')
const search = ref('')
const viewMode = ref<'cards' | 'table'>('cards')
const sortByOptions = ref<Record<string, string>>({ cv: 'Crit Value', rv: 'Roll Value' })
const meta = ref<PaginationMeta>({ page: 1, limit: 24, totalPages: 1, total: 0 })
const cardsAnchor = ref<HTMLElement | null>(null)

const cardLimitOptions = [12, 24, 48, 96]

let searchTimeout: ReturnType<typeof setTimeout> | null = null

const fetchArtifacts = async (page = 1) => {
  if (!genshinStore.selectedAccountId) return
  isLoading.value = true
  try {
    const url = new URL(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/artifacts`,
    )
    url.searchParams.append('sortBy', sortBy.value)
    url.searchParams.append('page', page.toString())
    url.searchParams.append('limit', meta.value.limit.toString())
    if (search.value) {
      url.searchParams.append('search', search.value)
    }

    const res = await authStore.fetchWithAuth(url.toString())
    if (res.ok) {
      const payload = await res.json()
      const data = payload.data || payload
      artifacts.value = data.items || []
      if (data.meta) meta.value = data.meta
      if (data.enum?.sortBy) sortByOptions.value = data.enum.sortBy
    }
  } catch (err) {
    console.error('Failed to fetch account artifacts', err)
  } finally {
    isLoading.value = false
  }
}

watch(sortBy, () => fetchArtifacts(1))

const onSearchInput = () => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchArtifacts(1)
  }, 500)
}

watch(() => genshinStore.selectedAccountId, () => {
  fetchArtifacts(1)
})

onMounted(() => {
  fetchArtifacts(1)
})

const tableLabels: TableLabel[] = [
  { key: 'id', title: 'ID' },
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
      v-if="!genshinStore.selectedAccountId"
      class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-xl shadow-sm text-center"
    >
      Please select an account from the sidebar or Accounts page to view your artifacts.
    </div>

    <div v-else class="space-y-6">
      <div
        class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-700"
      >
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            My Artifacts
          </h1>
          <p class="text-slate-500 dark:text-slate-400 mt-1">
            Found {{ meta.total }} artifacts for {{ genshinStore.selectedAccountName }}
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <div class="relative w-full sm:w-64">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              class="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              @input="onSearchInput"
            />
          </div>

          <select
            v-model="sortBy"
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
              :class="[
                'px-3 py-2 text-sm font-medium transition-colors',
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
              :class="[
                'px-3 py-2 text-sm font-medium transition-colors border-l border-slate-300 dark:border-slate-600',
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

      <div v-if="isLoading && artifacts.length === 0" class="flex justify-center p-12">
        <span
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
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            <ArtifactCard
              v-for="art in artifacts"
              :key="art.id"
              :artifact="art"
            />
          </div>
        </div>

        <BasePagination
          v-if="artifacts.length > 0"
          :meta="meta"
          :is-loading="isLoading"
          :scroll-anchor="cardsAnchor"
          :limit-options="cardLimitOptions"
          @page-change="fetchArtifacts"
          @limit-change="(l) => { meta.limit = l; fetchArtifacts(1) }"
        />
      </template>

      <BaseTable
        v-else
        :labels="tableLabels"
        :data="artifacts"
        :is-loading="isLoading"
        :meta="meta"
        @page-change="fetchArtifacts"
        @limit-change="(l) => { meta.limit = l; fetchArtifacts(1) }"
      >
        <template #setKey="{ item }">
          <div class="flex items-center gap-2">
            <img
              v-if="getArtifactIconUrl(item.setKey, item.slotKey)"
              :src="getArtifactIconUrl(item.setKey, item.slotKey)"
              :alt="item.setKey"
              class="w-8 h-8 object-contain rounded bg-slate-100 dark:bg-slate-800"
              loading="lazy"
              @error="onImageFallback"
            />
            <span class="font-medium">{{ formatSetName(item.setKey) }}</span>
          </div>
        </template>
        <template #slotKey="{ item }">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {{ item.slotKey }}
          </span>
        </template>
        <template #level="{ item }">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            +{{ item.level }}
          </span>
        </template>
        <template #mainStat="{ item }">
          <span class="font-semibold text-slate-900 dark:text-white whitespace-nowrap">
            {{ formatStatName(item.mainStatKey) }}
          </span>
        </template>
        <template #substats="{ item }">
          <div class="flex flex-col gap-1 min-w-[150px] py-2">
            <div
              v-for="sub in item.substats"
              :key="sub.key"
              class="flex justify-between items-center text-xs"
            >
              <span class="text-slate-600 dark:text-slate-300">{{ formatStatName(sub.key) }}</span>
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
  </div>
</template>
