<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800">Export</h1>
      <p class="text-slate-500 mt-1">Export your latest account data to external tools</p>
    </div>
    
    <div v-if="!genshinStore.selectedAccountId" class="bg-yellow-50 text-yellow-800 p-4 rounded-xl border border-yellow-200">
      Please select an account first from the dashboard.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Card 1: Optimizer -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <Icon icon="mdi:calculator-variant-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800">Optimizer</h2>
        </div>
        <p class="text-slate-600 text-sm mb-6 flex-1">Export your latest account data directly into the Genshin Optimizer format to calculate your best builds.</p>
        <button 
          @click="exportData('https://frzyc.github.io/genshin-optimizer/#/setting')" 
          :disabled="isExporting"
          class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
        >
          <Icon v-if="isExporting" icon="eos-icons:loading" class="w-5 h-5 animate-spin" />
          Export Latest Data to Genshin Optimizer
        </button>
      </div>

      <!-- Card 2: Planner -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <Icon icon="mdi:calendar-check-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800">Planner</h2>
        </div>
        <p class="text-slate-600 text-sm mb-6 flex-1">Export your latest account data to Seelie.me for tracking inventory and farming materials.</p>
        <button 
          @click="exportData('https://seelie.me/inventory')" 
          :disabled="isExporting"
          class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
        >
          <Icon v-if="isExporting" icon="eos-icons:loading" class="w-5 h-5 animate-spin" />
          Export Latest Data to Seelie.me
        </button>
      </div>

      <!-- Card 3: Achievement -->
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-purple-100 text-purple-600 rounded-lg">
            <Icon icon="mdi:trophy-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800">Achievement</h2>
        </div>
        <p class="text-slate-600 text-sm mb-6 flex-1">Export your achievements tracking to Stardb.gg or Seelie.me.</p>
        <div class="space-y-3">
          <button 
            @click="exportData('https://stardb.gg/en/import')" 
            :disabled="isExporting"
            class="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
          >
            <Icon v-if="isExporting" icon="eos-icons:loading" class="w-5 h-5 animate-spin" />
            Export Latest data to Stardb.gg
          </button>
          <button 
            @click="exportData('https://seelie.me/achievements')" 
            :disabled="isExporting"
            class="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
          >
            <Icon v-if="isExporting" icon="eos-icons:loading" class="w-5 h-5 animate-spin" />
            Export Latest data to Seelie.me
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useGenshinStore } from '../../stores/genshin'
import { useAuthStore } from '../../stores/auth'

const genshinStore = useGenshinStore()
const authStore = useAuthStore()

const isExporting = ref(false)

const exportData = async (url: string) => {
  if (!genshinStore.selectedAccountId) return
  
  isExporting.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/export/latest`)
    
    if (res.ok) {
      const responseData = await res.json()
      // Unwrap standard response wrapper if present
      const exportJson = responseData.data ? responseData.data : responseData
      
      // Copy to clipboard
      await navigator.clipboard.writeText(JSON.stringify(exportJson))
      
      // Open new tab
      window.open(url, '_blank')
    } else {
      alert('Failed to export data')
    }
  } catch (err) {
    console.error('Export error', err)
    alert('An error occurred while exporting.')
  } finally {
    isExporting.value = false
  }
}
</script>
