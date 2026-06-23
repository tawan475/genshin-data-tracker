<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()

const artifacts = ref<any[]>([])
const isLoading = ref(true)
const sortBy = ref<'cv' | 'rv'>('cv')
const limit = ref(100)

const fetchRanking = async () => {
  isLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/global/artifacts-ranking?sortBy=${sortBy.value}&limit=${limit.value}`)
    if (res.ok) {
      artifacts.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to fetch global ranking', err)
  } finally {
    isLoading.value = false
  }
}

watch(sortBy, () => {
  fetchRanking()
})

onMounted(() => {
  fetchRanking()
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
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6 pb-12">
    <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 shadow-lg text-white">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Global Artifacts Leaderboard</h1>
        <p class="text-blue-100 mt-2">Discover the highest rolled artifacts across all opted-in accounts.</p>
      </div>
      <div class="flex gap-2 bg-white/10 p-1.5 rounded-lg backdrop-blur-sm">
        <button 
          @click="sortBy = 'cv'" 
          :class="['px-4 py-2 rounded-md text-sm font-medium transition-all duration-300', sortBy === 'cv' ? 'bg-white text-indigo-700 shadow-sm' : 'text-white hover:bg-white/20']"
        >
          Sort by CV
        </button>
        <button 
          @click="sortBy = 'rv'" 
          :class="['px-4 py-2 rounded-md text-sm font-medium transition-all duration-300', sortBy === 'rv' ? 'bg-white text-indigo-700 shadow-sm' : 'text-white hover:bg-white/20']"
        >
          Sort by RV
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center p-12">
      <div class="animate-pulse flex gap-2 items-center text-slate-500">
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
      </div>
    </div>

    <div v-else-if="artifacts.length === 0" class="text-center p-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
      <p class="text-slate-500 dark:text-slate-400">No artifacts found in the global ranking. Opt-in via Settings!</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <div v-for="(art, idx) in artifacts" :key="art.id" 
        class="group relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
      >
        <div class="absolute top-0 right-0 bg-gradient-to-bl from-indigo-500 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-bl-xl shadow-sm z-10">
          Rank #{{ idx + 1 }}
        </div>
        
        <!-- Artifact Header -->
        <div class="p-5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50 relative overflow-hidden">
          <div class="absolute -right-6 -top-6 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          
          <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 truncate pr-8">{{ art.setKey }}</h3>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">{{ art.slotKey }}</p>
          
          <div class="mt-4 flex justify-between items-end">
            <div class="flex flex-col">
              <span class="text-xs text-slate-400 dark:text-slate-500">Main Stat</span>
              <span class="font-semibold text-slate-900 dark:text-white">{{ formatStatName(art.mainStatKey) }}</span>
            </div>
            <div class="flex flex-col items-end">
              <span class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                +{{ art.level }}
              </span>
            </div>
          </div>
        </div>

        <!-- Substats -->
        <div class="p-5 space-y-3">
          <div v-for="sub in art.substats" :key="sub.key" class="flex justify-between items-center text-sm">
            <span class="text-slate-600 dark:text-slate-300 font-medium">{{ formatStatName(sub.key) }}</span>
            <span :class="['font-bold', getSubstatColor(sub.key)]">+{{ formatStat(sub.key, sub.value) }}</span>
          </div>
        </div>
        
        <!-- Footer Stats -->
        <div class="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
          <div class="flex flex-col">
            <span class="text-xs text-slate-500 uppercase tracking-wider font-semibold">CV</span>
            <span class="font-bold text-slate-900 dark:text-white">{{ art.cv }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-xs text-slate-500 uppercase tracking-wider font-semibold">RV</span>
            <span class="font-bold text-slate-900 dark:text-white">{{ art.rv }}%</span>
          </div>
          <div class="flex flex-col items-end text-right" v-if="art.genshinAccount">
            <span class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Owner</span>
            <span class="font-bold text-indigo-600 dark:text-indigo-400 truncate max-w-[80px]" :title="art.genshinAccount.accountName">
              {{ art.genshinAccount.accountName }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
