<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import BaseTable, { TableLabel, PaginationMeta } from '../../components/BaseTable.vue'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()

const artifacts = ref<any[]>([])
const isLoading = ref(true)
const sortBy = ref<string>('cv')
const search = ref('')
const sortByOptions = ref<Record<string, string>>({ cv: 'Crit Value', rv: 'Roll Value' })
const meta = ref<PaginationMeta>({ page: 1, limit: 10, totalPages: 1, total: 0 })

let searchTimeout: any = null

const fetchArtifacts = async (page = 1) => {
  if (!genshinStore.selectedAccountId) return
  isLoading.value = true
  try {
    const url = new URL(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/artifacts`)
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

const getSubstatColor = (key: string) => {
  if (key.includes('critRate') || key.includes('critDMG')) return 'text-red-500 dark:text-red-400'
  if (key.includes('atk')) return 'text-orange-500 dark:text-orange-400'
  if (key.includes('enerRech')) return 'text-purple-500 dark:text-purple-400'
  if (key.includes('eleMas')) return 'text-emerald-500 dark:text-emerald-400'
  return 'text-slate-600 dark:text-slate-400'
}

const formatStat = (key: string, val: number) => {
  if (key.endsWith('_')) return `${val.toFixed(1)}%`
  return Math.round(val).toString()
}

const formatStatName = (key: string) => {
  const map: Record<string, string> = {
    'hp': 'HP', 'hp_': 'HP%', 'atk': 'ATK', 'atk_': 'ATK%', 'def': 'DEF', 'def_': 'DEF%',
    'eleMas': 'EM', 'enerRech_': 'ER%', 'critRate_': 'CRIT Rate', 'critDMG_': 'CRIT DMG',
    'heal_': 'Healing Bonus', 'hydro_dmg_': 'Hydro DMG', 'pyro_dmg_': 'Pyro DMG',
    'cryo_dmg_': 'Cryo DMG', 'electro_dmg_': 'Electro DMG', 'anemo_dmg_': 'Anemo DMG',
    'geo_dmg_': 'Geo DMG', 'dendro_dmg_': 'Dendro DMG', 'physical_dmg_': 'Physical DMG'
  }
  return map[key] || key
}

const tableLabels: TableLabel[] = [
  { key: 'id', title: 'ID' },
  { key: 'setKey', title: 'Set' },
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
    <div v-if="!genshinStore.selectedAccountId" class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 p-4 rounded-xl shadow-sm text-center">
      Please select an account from the sidebar or Accounts page to view your artifacts.
    </div>

    <div v-else class="space-y-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 rounded-2xl p-6 md:p-8 shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">My Artifacts</h1>
          <p class="text-slate-500 dark:text-slate-400 mt-1">Found {{ meta.total }} artifacts for {{ genshinStore.selectedAccountName }}</p>
        </div>
        
        <div class="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          <!-- Search -->
          <div class="relative w-full sm:w-64">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
              type="text" 
              v-model="search" 
              @input="onSearchInput"
              placeholder="Search artifacts..." 
              class="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            >
          </div>

          <!-- Sort By Selector -->
          <select 
            v-model="sortBy"
            class="block w-full sm:w-40 pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
          >
            <option v-for="(label, value) in sortByOptions" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
        </div>
      </div>

      <BaseTable 
        :labels="tableLabels" 
        :data="artifacts" 
        :is-loading="isLoading"
        :meta="meta"
        @page-change="fetchArtifacts"
        @limit-change="(l) => { meta.limit = l; fetchArtifacts(1) }"
      >
        <template #slotKey="{ item }">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ item.slotKey }}</span>
        </template>
        <template #level="{ item }">
          <span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            +{{ item.level }}
          </span>
        </template>
        <template #mainStat="{ item }">
          <span class="font-semibold text-slate-900 dark:text-white whitespace-nowrap">{{ formatStatName(item.mainStatKey) }}</span>
        </template>
        <template #substats="{ item }">
          <div class="flex flex-col gap-1 min-w-[150px] py-2">
            <div v-for="sub in item.substats" :key="sub.key" class="flex justify-between items-center text-xs">
              <span class="text-slate-600 dark:text-slate-300">{{ formatStatName(sub.key) }}</span>
              <span :class="['font-bold', getSubstatColor(sub.key)]">+{{ formatStat(sub.key, sub.value) }}</span>
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
