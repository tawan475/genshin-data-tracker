<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useGenshinStore } from '../../stores/genshin'
import MoraDisplay from '../../components/MoraDisplay.vue'
import ItemDisplay from '../../components/ItemDisplay.vue'
import { useAuthStore } from '../../stores/auth'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'
import zoomPlugin from 'chartjs-plugin-zoom'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
)

const genshinStore = useGenshinStore()
const authStore = useAuthStore()

// Detail Data
const detailTimelineData = ref<any[]>([])
const isLoadingDetailData = ref(false)
const detailGroupBy = ref<'hour' | 'day' | 'month' | 'year'>('day')
const detailLimit = ref(365)
const storageStats = ref<{ totalSnapshots: number, totalFileSize: number, totalCompressedFileSize: number } | null>(null)

// ─── Detail chart config (larger) ───
const detailChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ctx.parsed.y?.toLocaleString() ?? ''
      }
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'x' as const,
      },
      zoom: {
        wheel: {
          enabled: true,
        },
        pinch: {
          enabled: true
        },
        mode: 'x' as const,
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: '#f1f5f9' },
      ticks: { callback: (val: string | number) => { const v = Number(val); return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v } }
    },
    x: {
      grid: { color: '#f8fafc' },
      ticks: { maxRotation: 45 }
    }
  },
  elements: { point: { radius: 3 } }
}

const detailDiffChartOptions = {
  ...detailChartOptions,
  scales: {
    ...detailChartOptions.scales,
    y: {
      ...detailChartOptions.scales.y,
      beginAtZero: false
    }
  }
}

// ─── Fetch detail (server-side aggregated) ───
const fetchDetailData = async () => {
  if (!genshinStore.selectedAccountId) return
  isLoadingDetailData.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/overview?groupBy=${detailGroupBy.value}&limit=${detailLimit.value}`)
    if (res.ok) {
      const parsed = await res.json()
      detailTimelineData.value = (parsed.data && parsed.data.timeline) ? parsed.data.timeline : (parsed.timeline || [])
      const storage = parsed.data?.storage || parsed.storage
      if (storage) {
        storageStats.value = storage
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    isLoadingDetailData.value = false
  }
}

const monthlyAnalysisData = ref<any>(null)
const isFetchingMonthly = ref(false)
const analysisMonth = ref(new Date().getUTCMonth() + 1)
const analysisYear = ref(new Date().getUTCFullYear())

const fetchMonthlyAnalysis = async () => {
  if (!genshinStore.selectedAccountId) return
  isFetchingMonthly.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/analysis/monthly?month=${analysisMonth.value}&year=${analysisYear.value}`)
    if (res.ok) {
      const parsed = await res.json()
      monthlyAnalysisData.value = parsed.data || parsed
    }
  } catch (err) {
    console.error(err)
  } finally {
    isFetchingMonthly.value = false
  }
}

const prevMonth = () => {
  if (analysisMonth.value === 1) {
    analysisMonth.value = 12
    analysisYear.value -= 1
  } else {
    analysisMonth.value -= 1
  }
  fetchMonthlyAnalysis()
}

const nextMonth = () => {
  if (analysisMonth.value === 12) {
    analysisMonth.value = 1
    analysisYear.value += 1
  } else {
    analysisMonth.value += 1
  }
  fetchMonthlyAnalysis()
}

watch([() => genshinStore.selectedAccountId, detailGroupBy], () => {
  if (genshinStore.selectedAccountId) {
    fetchDetailData()
    fetchMonthlyAnalysis()
  }
})

onMounted(() => {
  if (genshinStore.selectedAccountId) {
    fetchDetailData()
    fetchMonthlyAnalysis()
  }
})

watch([detailGroupBy, detailLimit], () => {
  fetchDetailData()
})

// ─── Detail computed ───
const detailLabels = computed(() => {
  return detailTimelineData.value.map(t => {
    const d = new Date(t.timestamp)
    if (detailGroupBy.value === 'year') return d.getFullYear().toString()
    if (detailGroupBy.value === 'month') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    if (detailGroupBy.value === 'hour') return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
})

const detailMoraChart = computed(() => ({
  labels: detailLabels.value,
  datasets: [{
    label: 'Mora',
    data: detailTimelineData.value.map(t => t.mora),
    borderColor: '#eab308',
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    fill: true,
    tension: 0.3,
    borderWidth: 2
  }]
}))

const detailPrimogemChart = computed(() => ({
  labels: detailLabels.value,
  datasets: [{
    label: 'Primogems',
    data: detailTimelineData.value.map(t => t.primogem),
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    fill: true,
    tension: 0.3,
    borderWidth: 2
  }]
}))

const detailMoraDiffChart = computed(() => {
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.mora - arr[i - 1].mora
  })
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Mora Diff',
      data,
      borderColor: '#ca8a04', // darker amber
      backgroundColor: 'rgba(202, 138, 4, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})

const detailPrimogemDiffChart = computed(() => {
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.primogem - arr[i - 1].primogem
  })
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Primogem Diff',
      data,
      borderColor: '#db2777', // darker pink
      backgroundColor: 'rgba(219, 39, 119, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]">
    <div v-if="genshinStore.selectedAccountId">
      <!-- Detailed Progression Section -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative z-10">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 class="text-lg font-bold text-slate-900">Detailed Progression</h3>
          
          <div class="flex flex-wrap items-center gap-4">
            <!-- Group By -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Group by</label>
              <select
                v-model="detailGroupBy"
                class="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            <!-- Zoom Instructions -->
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded flex items-center gap-2">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                Scroll to zoom, drag to pan
              </span>
            </div>
          </div>
        </div>

        <div v-if="isLoadingDetailData" class="flex justify-center p-8">
          <span class="w-6 h-6 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin"></span>
        </div>
        <div v-else-if="detailTimelineData.length === 0" class="text-center py-8 text-slate-400">
          No data for the selected range.
        </div>
        <div v-else class="space-y-6">
          <!-- Mora Charts -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                Mora Total
                <span class="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-bold">
                  {{ detailTimelineData[detailTimelineData.length - 1]?.mora?.toLocaleString() }}
                </span>
              </h4>
              <div class="h-72">
                <Line :data="detailMoraChart" :options="detailChartOptions" />
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                Mora Gain/Loss
              </h4>
              <div class="h-72">
                <Line :data="detailMoraDiffChart" :options="detailDiffChartOptions" />
              </div>
            </div>
          </div>

          <!-- Primogem Charts -->
          <div class="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                Primogems Total
                <span class="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded font-bold">
                  {{ detailTimelineData[detailTimelineData.length - 1]?.primogem?.toLocaleString() }}
                </span>
              </h4>
              <div class="h-72">
                <Line :data="detailPrimogemChart" :options="detailChartOptions" />
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                Primogems Gain/Loss
              </h4>
              <div class="h-72">
                <Line :data="detailPrimogemDiffChart" :options="detailDiffChartOptions" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Storage Stats -->
      <div v-if="storageStats" class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative z-10 mt-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wider">Storage</h3>
          <div class="flex flex-wrap items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-slate-500">Snapshots:</span>
              <span class="font-semibold text-slate-900">{{ storageStats.totalSnapshots }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500">Raw Data:</span>
              <span class="font-semibold text-slate-900">{{ formatBytes(storageStats.totalFileSize) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500">Stored:</span>
              <span class="font-semibold text-emerald-700">{{ formatBytes(storageStats.totalCompressedFileSize) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500">Saved:</span>
              <span class="font-semibold text-emerald-700">
                {{ storageStats.totalFileSize > 0 ? ((1 - storageStats.totalCompressedFileSize / storageStats.totalFileSize) * 100).toFixed(1) : 0 }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Analysis Table -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative z-10 mt-8">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            Monthly Analysis
            <span v-if="monthlyAnalysisData" class="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">
              {{ String(monthlyAnalysisData.month).padStart(2, '0') }} / {{ monthlyAnalysisData.year }}
            </span>
          </h3>
          
          <div class="flex items-center gap-2">
            <button @click="prevMonth" class="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>
            <button @click="nextMonth" class="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>
          </div>
        </div>

        <div v-if="isFetchingMonthly" class="flex justify-center p-8">
          <span class="w-6 h-6 border-3 border-slate-200 border-t-slate-900 rounded-full animate-spin"></span>
        </div>
        <div v-else-if="!monthlyAnalysisData || monthlyAnalysisData.rows.length === 0" class="text-center py-8 text-slate-400">
          No data for this month.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200">
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Date</th>
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Primogem</th>
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Mora</th>
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Artifact</th>
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Extract</th>
                <th class="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">Net Worth</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="row in monthlyAnalysisData.rows" :key="row.date" class="hover:bg-slate-50/50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-900 align-top whitespace-nowrap">
                  {{ row.date }}
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <ItemDisplay :amount="row.primogem.total" name="primogem" image="/img/Item_Primogem.webp" class="font-semibold text-sky-600" />
                    <span class="text-xs font-medium" :class="row.primogem.diff >= 0 ? 'text-emerald-600' : 'text-red-500'">
                      &nbsp;({{ row.primogem.diff >= 0 ? '+' : '' }}{{ row.primogem.diff.toLocaleString() }})
                    </span>
                  </div>
                </td>

                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <MoraDisplay :amount="row.mora.total" class="font-semibold text-amber-700" />
                    <span class="text-xs font-medium" :class="row.mora.diff >= 0 ? 'text-emerald-600' : 'text-red-500'">
                      &nbsp;({{ row.mora.diff >= 0 ? '+' : '' }}{{ row.mora.diff.toLocaleString() }}<span class="sr-only">&nbsp;mora</span>)
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <MoraDisplay :amount="row.artifact.totalWorth" class="font-semibold text-slate-900" />
                    <span class="text-xs font-medium" :class="row.artifact.diffWorth >= 0 ? 'text-emerald-600' : 'text-red-500'">
                      &nbsp;({{ row.artifact.diffWorth >= 0 ? '+' : '' }}{{ row.artifact.diffWorth.toLocaleString() }}<span class="sr-only">&nbsp;mora</span>)
                    </span>
                  </div>
                  
                  <div class="text-xs text-slate-600 flex items-center gap-1.5">
                    <span class="flex items-center">
                      <span class="text-purple-600 font-medium inline-flex items-center">{{ row.artifact.total4 }}x 4⭐</span>,
                      <span class="text-blue-600 font-medium inline-flex items-center ml-1">{{ row.artifact.total3 }}x 3⭐</span>
                    </span>
                    <span class="flex items-center">
                      (
                      <span class="inline-flex items-center" :class="row.artifact.diff4 >= 0 ? 'text-emerald-600' : 'text-red-500'">
                        {{ row.artifact.diff4 >= 0 ? '+' : '' }}{{ row.artifact.diff4 }}x 4⭐
                      </span>,
                      <span class="inline-flex items-center ml-1" :class="row.artifact.diff3 >= 0 ? 'text-emerald-600' : 'text-red-500'">
                        {{ row.artifact.diff3 >= 0 ? '+' : '' }}{{ row.artifact.diff3 }}x 3⭐
                      </span>
                      )
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <span class="font-semibold text-slate-900">{{ row.extract.totalExp.toLocaleString() }}</span>
                    <span class="text-xs font-medium" :class="row.extract.diffExp >= 0 ? 'text-emerald-600' : 'text-red-500'">
                      ({{ row.extract.diffExp >= 0 ? '+' : '' }}{{ row.extract.diffExp.toLocaleString() }})
                    </span>
                  </div>
                  
                  <div class="text-xs text-slate-600 flex items-center gap-1.5">
                    <span class="flex items-center gap-1">
                      <ItemDisplay :amount="row.extract.total4" image="/img/Item_Sanctifying_Essence.webp" name="Sanctifying Essence" class="text-purple-600 font-medium" />,
                      <ItemDisplay :amount="row.extract.total3" image="/img/Item_Sanctifying_Unction.webp" name="Sanctifying Unction" class="text-blue-600 font-medium" />
                    </span>
                    <span class="flex items-center gap-1">
                      (
                      <ItemDisplay 
                        :amount="(row.extract.diff4 >= 0 ? '+' : '') + row.extract.diff4" 
                        image="/img/Item_Sanctifying_Essence.webp" 
                        name="Sanctifying Essence" 
                        :class="row.extract.diff4 >= 0 ? 'text-emerald-600' : 'text-red-500'" 
                      />,
                      <ItemDisplay 
                        :amount="(row.extract.diff3 >= 0 ? '+' : '') + row.extract.diff3" 
                        image="/img/Item_Sanctifying_Unction.webp" 
                        name="Sanctifying Unction" 
                        :class="row.extract.diff3 >= 0 ? 'text-emerald-600' : 'text-red-500'" 
                      />
                      )
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <MoraDisplay :amount="row.mora.total + row.artifact.totalWorth" class="font-semibold text-emerald-700" />
                    <span class="text-xs font-medium" :class="(row.mora.diff + row.artifact.diffWorth) >= 0 ? 'text-emerald-600' : 'text-red-500'">
                      &nbsp;({{ (row.mora.diff + row.artifact.diffWorth) >= 0 ? '+' : '' }}{{ (row.mora.diff + row.artifact.diffWorth).toLocaleString() }}<span class="sr-only">&nbsp;mora</span>)
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
