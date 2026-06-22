<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useGenshinStore } from '../../stores/genshin'
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



// Overview Data
const timelineData = ref<any[]>([])
const isLoadingData = ref(false)

// ─── Aggregation helpers ───
function aggregateTimeline(data: any[], mode: 'day' | 'month') {
  const groups = new Map<string, any>()
  for (const entry of data) {
    const d = new Date(entry.timestamp)
    const key = mode === 'day'
      ? d.toISOString().slice(0, 10) // YYYY-MM-DD
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` // YYYY-MM
    // Keep latest entry per group (data is sorted asc, so last write wins)
    groups.set(key, entry)
  }
  return Array.from(groups.values())
}

function filterLast3Months(data: any[]) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  return data.filter(d => new Date(d.timestamp) >= cutoff)
}

// ─── Overview chart config (compact) ───
const overviewChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: any) => ctx.parsed.y?.toLocaleString() ?? ''
      }
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: '#f1f5f9' },
      ticks: { font: { size: 10 }, callback: (val: string | number) => { const v = Number(val); return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v } }
    },
    x: {
      grid: { display: false },
      ticks: { font: { size: 10 }, maxRotation: 45 }
    }
  },
  elements: { point: { radius: 2 } }
}

// ─── Fetch overview (raw, client-side aggregated) ───
const fetchOverviewData = async () => {
  if (!genshinStore.selectedAccountId) return
  isLoadingData.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/overview`)
    if (res.ok) {
      const data = await res.json()
      timelineData.value = data.data.timeline || []
    }
  } catch (err) {
    console.error('Failed to fetch overview data:', err)
  } finally {
    isLoadingData.value = false
  }
}

watch(() => genshinStore.selectedAccountId, () => {
  fetchOverviewData()
}, { immediate: true })

watch(() => genshinStore.refetchTrigger, () => {
  if (genshinStore.selectedAccountId) fetchOverviewData()
})

// ─── Overview computed (client-side aggregated, last 3 months) ───
const overviewTimeline = computed(() => {
  let filtered = filterLast3Months(timelineData.value)
  if (filtered.length > 60) {
    filtered = aggregateTimeline(filtered, 'month')
  } else {
    filtered = aggregateTimeline(filtered, 'day')
  }
  return filtered
})

const overviewLabels = computed(() => {
  return overviewTimeline.value.map(t => {
    const d = new Date(t.timestamp)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
})

const overviewMoraChart = computed(() => ({
  labels: overviewLabels.value,
  datasets: [{
    label: 'Mora',
    data: overviewTimeline.value.map(t => t.mora),
    borderColor: '#eab308',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    fill: true,
    tension: 0.4
  }]
}))

const overviewPrimogemChart = computed(() => ({
  labels: overviewLabels.value,
  datasets: [{
    label: 'Primogems',
    data: overviewTimeline.value.map(t => t.primogem),
    borderColor: '#ec4899',
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
    fill: true,
    tension: 0.4
  }]
}))

const latestStats = computed(() => {
  if (timelineData.value.length === 0) return null
  return timelineData.value[timelineData.value.length - 1]
})


</script>

<template>
  <div 
    class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]"
  >
    <div v-if="genshinStore.selectedAccountId">
      <div v-if="isLoadingData" class="flex justify-center p-12">
        <span class="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></span>
      </div>
      <div v-else-if="timelineData.length === 0" class="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm mt-8 relative z-10">
        <h3 class="text-lg font-bold text-slate-700 mb-2">No Data Yet</h3>
        <p class="text-slate-500">Import your first GOOD JSON file to see your account progression over time.</p>
      </div>
      <div v-else class="space-y-8 relative z-10">
        <!-- Overview Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Characters</h3>
            <p class="text-3xl font-bold text-slate-900">{{ latestStats?.totalCharacters || 0 }}</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Artifacts</h3>
            <p class="text-3xl font-bold text-slate-900">{{ latestStats?.totalArtifacts || 0 }}</p>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Last Sync</h3>
            <p class="text-lg font-bold text-slate-900 mt-2">{{ new Date(latestStats?.timestamp).toLocaleString() }}</p>
          </div>
        </div>

        <!-- Overview Charts (compact, auto-aggregated, last 3 months) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 class="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4 flex items-center justify-between">
              Mora Progression
              <span class="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-bold">{{ latestStats?.mora?.toLocaleString() }}</span>
            </h3>
            <div class="h-48">
              <Line :data="overviewMoraChart" :options="overviewChartOptions" />
            </div>
          </div>
          <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 class="text-sm font-semibold text-slate-800 uppercase tracking-wider mb-4 flex items-center justify-between">
              Primogem Progression
              <span class="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded font-bold">{{ latestStats?.primogem?.toLocaleString() }}</span>
            </h3>
            <div class="h-48">
              <Line :data="overviewPrimogemChart" :options="overviewChartOptions" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
