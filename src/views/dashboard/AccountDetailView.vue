<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useGenshinStore } from '../../stores/genshin'
import MoraDisplay from '../../components/MoraDisplay.vue'
import ItemDisplay from '../../components/ItemDisplay.vue'
import BaseButton from '../../components/BaseButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
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
const settingsStore = useSettingsStore()

// Detail Data
const detailTimelineData = ref<any[]>([])
const isLoadingDetailData = ref(false)
const detailGroupBy = ref<'hour' | 'day' | 'month' | 'year'>('day')
const detailLimit = ref(365)

// ─── Detail chart config (larger) ───
const detailChartOptions = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  const textColor = isDark ? '#94a3b8' : '#64748b' // slate-400 : slate-500
  const gridColor = isDark ? '#334155' : '#f1f5f9' // slate-700 : slate-100

  return {
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
        grid: { color: gridColor },
        ticks: { color: textColor, callback: (val: string | number) => { const v = Number(val); return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v } }
      },
      x: {
        grid: { color: isDark ? '#1e293b' : '#f8fafc' }, // slate-800 : slate-50
        ticks: { color: textColor, maxRotation: 45 }
      }
    },
    elements: { point: { radius: 3 } }
  }
})

const detailDiffChartOptions = computed(() => {
  const base = detailChartOptions.value
  return {
    ...base,
    scales: {
      ...base.scales,
      y: {
        ...base.scales.y,
        beginAtZero: false
      }
    }
  }
})

// ─── Fetch detail (server-side aggregated) ───
const fetchDetailData = async () => {
  if (!genshinStore.selectedAccountId) return
  isLoadingDetailData.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/overview?groupBy=${detailGroupBy.value}&limit=${detailLimit.value}`)
    if (res.ok) {
      const parsed = await res.json()
      detailTimelineData.value = (parsed.data && parsed.data.timeline) ? parsed.data.timeline : (parsed.timeline || [])
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
    if (detailGroupBy.value === 'hour') return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: !settingsStore.use24Hour })
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
})

const detailMoraChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Mora',
      data: detailTimelineData.value.map(t => t.mora),
      borderColor: isDark ? '#facc15' : '#eab308', // yellow-400 : yellow-500
      backgroundColor: 'rgba(234, 179, 8, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})

const detailPrimogemChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Primogems',
      data: detailTimelineData.value.map(t => t.primogem),
      borderColor: isDark ? '#38bdf8' : '#0ea5e9', // sky-400 : sky-500
      backgroundColor: 'rgba(14, 165, 233, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})

const detailMoraDiffChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.mora - arr[i - 1].mora
  })
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Mora Diff',
      data,
      borderColor: isDark ? '#facc15' : '#ca8a04', // yellow-400 : yellow-600
      backgroundColor: 'rgba(202, 138, 4, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})

const detailPrimogemDiffChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.primogem - arr[i - 1].primogem
  })
  return {
    labels: detailLabels.value,
    datasets: [{
      label: 'Primogem Diff',
      data,
      borderColor: isDark ? '#38bdf8' : '#0284c7', // sky-400 : sky-600
      backgroundColor: 'rgba(2, 132, 199, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2
    }]
  }
})
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]">
    <div v-if="genshinStore.selectedAccountId">
      <!-- Detailed Progression Section -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 relative z-10 transition-colors">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white transition-colors">Detailed Progression</h3>
          
          <div class="flex flex-wrap items-center gap-4">
            <!-- Group By -->
            <div class="flex items-center gap-2">
              <label class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">Group by</label>
              <select
                v-model="detailGroupBy"
                class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
              >
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            <!-- Zoom Instructions -->
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                Scroll to zoom, drag to pan
              </span>
            </div>
          </div>
        </div>

        <div v-if="isLoadingDetailData" class="flex justify-center p-8">
          <span class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"></span>
        </div>
        <div v-else-if="detailTimelineData.length === 0" class="text-center py-8 text-slate-400 dark:text-slate-500 transition-colors">
          No data for the selected range.
        </div>
        <div v-else class="space-y-6">
          <!-- Mora Charts -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors">
                Mora Total
                <span class="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-500 px-2 py-1 rounded font-bold transition-colors">
                  {{ detailTimelineData[detailTimelineData.length - 1]?.mora?.toLocaleString() }}
                </span>
              </h4>
              <div class="h-72">
                <Line :data="detailMoraChart" :options="detailChartOptions" />
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors">
                Mora Gain/Loss
              </h4>
              <div class="h-72">
                <Line :data="detailMoraDiffChart" :options="detailDiffChartOptions" />
              </div>
            </div>
          </div>

          <!-- Primogem Charts -->
          <div class="pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6 transition-colors">
            <div>
              <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors">
                Primogems Total
                <span class="text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-400 px-2 py-1 rounded font-bold transition-colors">
                  {{ detailTimelineData[detailTimelineData.length - 1]?.primogem?.toLocaleString() }}
                </span>
              </h4>
              <div class="h-72">
                <Line :data="detailPrimogemChart" :options="detailChartOptions" />
              </div>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors">
                Primogems Gain/Loss
              </h4>
              <div class="h-72">
                <Line :data="detailPrimogemDiffChart" :options="detailDiffChartOptions" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Monthly Analysis Table -->
      <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 relative z-10 mt-8 transition-colors">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors">
            Monthly Analysis
            <span v-if="monthlyAnalysisData" class="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-400 px-2 py-1 rounded transition-colors">
              {{ String(monthlyAnalysisData.month).padStart(2, '0') }} / {{ monthlyAnalysisData.year }}
            </span>
          </h3>
          
          <div class="flex items-center gap-2">
            <BaseButton variant="secondary" size="xs" @click="prevMonth" class="!p-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </BaseButton>
            <BaseButton variant="secondary" size="xs" @click="nextMonth" class="!p-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </BaseButton>
          </div>
        </div>

        <div v-if="isFetchingMonthly" class="flex justify-center p-8">
          <span class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"></span>
        </div>
        <div v-else-if="!monthlyAnalysisData || monthlyAnalysisData.rows.length === 0" class="text-center py-8 text-slate-400 dark:text-slate-500 transition-colors">
          No data for this month.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 transition-colors">
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Date</th>
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Primogem</th>
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Mora</th>
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Artifact</th>
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Extract</th>
                <th class="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap transition-colors">Net Worth</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50 transition-colors">
              <tr v-for="row in monthlyAnalysisData.rows" :key="row.date" class="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 align-top whitespace-nowrap transition-colors">
                  {{ row.date }}
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <ItemDisplay :amount="row.primogem.total" name="primogem" image="/img/Item_Primogem.webp" class="font-semibold text-sky-600 dark:text-sky-400 transition-colors" />
                    <span class="text-xs font-medium transition-colors" :class="row.primogem.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                      &nbsp;({{ row.primogem.diff >= 0 ? '+' : '' }}{{ row.primogem.diff.toLocaleString() }})
                    </span>
                  </div>
                </td>

                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <MoraDisplay :amount="row.mora.total" class="font-semibold text-amber-700 dark:text-amber-500 transition-colors" />
                    <span class="text-xs font-medium transition-colors" :class="row.mora.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                      &nbsp;({{ row.mora.diff >= 0 ? '+' : '' }}{{ row.mora.diff.toLocaleString() }}<span class="sr-only">&nbsp;mora</span>)
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <MoraDisplay :amount="row.artifact.totalWorth" class="font-semibold text-slate-900 dark:text-white transition-colors" />
                    <span class="text-xs font-medium transition-colors" :class="row.artifact.diffWorth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                      &nbsp;({{ row.artifact.diffWorth >= 0 ? '+' : '' }}{{ row.artifact.diffWorth.toLocaleString() }}<span class="sr-only">&nbsp;mora</span>)
                    </span>
                  </div>
                  
                  <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                    <span class="flex items-center">
                      <span class="text-purple-600 dark:text-purple-400 font-medium inline-flex items-center transition-colors">{{ row.artifact.total4 }}x 4⭐</span>,
                      <span class="text-blue-600 dark:text-blue-400 font-medium inline-flex items-center ml-1 transition-colors">{{ row.artifact.total3 }}x 3⭐</span>
                    </span>
                    <span class="flex items-center">
                      (
                      <span class="inline-flex items-center transition-colors" :class="row.artifact.diff4 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                        {{ row.artifact.diff4 >= 0 ? '+' : '' }}{{ row.artifact.diff4 }}x 4⭐
                      </span>,
                      <span class="inline-flex items-center ml-1 transition-colors" :class="row.artifact.diff3 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                        {{ row.artifact.diff3 >= 0 ? '+' : '' }}{{ row.artifact.diff3 }}x 3⭐
                      </span>
                      )
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <span class="font-semibold text-slate-900 dark:text-white transition-colors">{{ row.extract.totalExp.toLocaleString() }}</span>
                    <span class="text-xs font-medium transition-colors" :class="row.extract.diffExp >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
                      ({{ row.extract.diffExp >= 0 ? '+' : '' }}{{ row.extract.diffExp.toLocaleString() }})
                    </span>
                  </div>
                  
                  <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 transition-colors">
                    <span class="flex items-center gap-1">
                      <ItemDisplay :amount="row.extract.total4" image="/img/Item_Sanctifying_Essence.webp" name="Sanctifying Essence" class="text-purple-600 dark:text-purple-400 font-medium transition-colors" />,
                      <ItemDisplay :amount="row.extract.total3" image="/img/Item_Sanctifying_Unction.webp" name="Sanctifying Unction" class="text-blue-600 dark:text-blue-400 font-medium transition-colors" />
                    </span>
                    <span class="flex items-center gap-1">
                      (
                      <ItemDisplay 
                        :amount="(row.extract.diff4 >= 0 ? '+' : '') + row.extract.diff4" 
                        image="/img/Item_Sanctifying_Essence.webp" 
                        name="Sanctifying Essence" 
                        :class="row.extract.diff4 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'" 
                        class="transition-colors"
                      />,
                      <ItemDisplay 
                        :amount="(row.extract.diff3 >= 0 ? '+' : '') + row.extract.diff3" 
                        image="/img/Item_Sanctifying_Unction.webp" 
                        name="Sanctifying Unction" 
                        :class="row.extract.diff3 >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'" 
                        class="transition-colors"
                      />
                      )
                    </span>
                  </div>
                </td>
                
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <MoraDisplay :amount="row.mora.total + row.artifact.totalWorth" class="font-semibold text-emerald-700 dark:text-emerald-500 transition-colors" />
                    <span class="text-xs font-medium transition-colors" :class="(row.mora.diff + row.artifact.diffWorth) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'">
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
