<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import ArtifactCard from '../../components/ArtifactCard.vue'
import type { ArtifactCardData } from '../../utils/artifact-stats'

const authStore = useAuthStore()

const artifacts = ref<ArtifactCardData[]>([])
const isLoading = ref(true)
const sortBy = ref<'cv' | 'rv'>('cv')
const limit = ref(100)

const fetchRanking = async () => {
  isLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(
      `${authStore.API_URL}/genshin-accounts/global/artifacts-ranking?sortBy=${sortBy.value}&limit=${limit.value}`,
    )
    if (res.ok) {
      const json = await res.json()
      artifacts.value = (json.data ?? json) as ArtifactCardData[]
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
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-6 pb-12">
    <div
      class="flex flex-col md:flex-row justify-between items-center gap-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 shadow-lg text-white"
    >
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Global Artifacts Leaderboard</h1>
        <p class="text-blue-100 mt-2">
          Discover the highest rolled artifacts across all opted-in accounts.
        </p>
      </div>
      <div class="flex gap-2 bg-white/10 p-1.5 rounded-lg backdrop-blur-sm">
        <button
          type="button"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-all duration-300',
            sortBy === 'cv'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-white hover:bg-white/20',
          ]"
          @click="sortBy = 'cv'"
        >
          Sort by CV
        </button>
        <button
          type="button"
          :class="[
            'px-4 py-2 rounded-md text-sm font-medium transition-all duration-300',
            sortBy === 'rv'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-white hover:bg-white/20',
          ]"
          @click="sortBy = 'rv'"
        >
          Sort by RV
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center p-12">
      <div class="animate-pulse flex gap-2 items-center text-slate-500">
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce" />
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce delay-75" />
        <div class="w-3 h-3 bg-indigo-500 rounded-full animate-bounce delay-150" />
      </div>
    </div>

    <div
      v-else-if="artifacts.length === 0"
      class="text-center p-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700"
    >
      <p class="text-slate-500 dark:text-slate-400">
        No artifacts found in the global ranking. Opt-in via Settings!
      </p>
    </div>

    <div
      v-else
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3"
    >
      <ArtifactCard
        v-for="(art, idx) in artifacts"
        :key="art.id ?? idx"
        :artifact="art"
        :rank="idx + 1"
        show-owner
      />
    </div>
  </div>
</template>
