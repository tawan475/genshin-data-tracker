<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-white transition-colors">Export</h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 transition-colors">Export your latest account data to external tools</p>
    </div>
    
    <div v-if="!genshinStore.selectedAccountId" class="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-500 p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/50 transition-colors">
      Please select an account first from the dashboard.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Card 1: Optimizer -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors">
            <Icon icon="mdi:calculator-variant-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Optimizer</h2>
        </div>
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">Export your latest account data directly into the Genshin Optimizer format to calculate your best builds.</p>
        <BaseButton 
          variant="blue"
          block
          size="lg"
          :loading="isExporting"
          @click="exportData('https://frzyc.github.io/genshin-optimizer/#/setting')" 
        >
          Export Latest Data to Genshin Optimizer
        </BaseButton>
      </div>

      <!-- Card 2: Planner -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors">
            <Icon icon="mdi:calendar-check-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Planner</h2>
        </div>
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">Export your latest account data to Seelie.me for tracking inventory and farming materials.</p>
        <BaseButton 
          variant="emerald"
          block
          size="lg"
          :loading="isExporting"
          @click="exportData('https://seelie.me/inventory')" 
        >
          Export Latest Data to Seelie.me
        </BaseButton>
      </div>

      <!-- Card 3: Achievement -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors">
        <div class="flex items-center gap-3 mb-4">
          <div class="p-3 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-lg transition-colors">
            <Icon icon="mdi:trophy-outline" class="w-6 h-6" />
          </div>
          <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Achievement</h2>
        </div>
        <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">Export your achievements tracking to Stardb.gg or Seelie.me.</p>
        <div class="space-y-3">
          <BaseButton 
            variant="purple"
            block
            size="lg"
            :loading="isExporting"
            @click="exportData('https://stardb.gg/en/import')" 
          >
            Export Latest data to Stardb.gg
          </BaseButton>
          <BaseButton 
            variant="secondary"
            block
            size="lg"
            :loading="isExporting"
            @click="exportData('https://seelie.me/achievements')" 
          >
            Export Latest data to Seelie.me
          </BaseButton>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import BaseButton from '../../components/BaseButton.vue'
import { useGenshinStore } from '../../stores/genshin'
import { useAuthStore } from '../../stores/auth'
import { swalError } from '../../utils/swal'

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
      swalError('Error', 'Failed to export data')
    }
  } catch (err) {
    console.error('Export error', err)
    swalError('Error', 'An error occurred while exporting.')
  } finally {
    isExporting.value = false
  }
}
</script>
