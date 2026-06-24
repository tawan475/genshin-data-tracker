<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGenshinStore } from '../../stores/genshin'
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
  Filler,
} from 'chart.js'
import { Line } from 'vue-chartjs'
import zoomPlugin from 'chartjs-plugin-zoom'
import BaseButton from '../../components/BaseButton.vue'
import { formatBytes } from '../../utils/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
)

interface TimelinePoint {
  timestamp: string
  mora: number
  primogem: number
  totalCharacters: number
  totalArtifacts: number
}

interface OverviewStorage {
  totalSnapshots: number
  totalFileSize: number
  totalCompressedFileSize: number
}

interface OverviewLatest {
  timestamp: string
  mora: number
  primogem: number
  totalCharacters: number
  totalArtifacts: number
}

const genshinStore = useGenshinStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const timelineData = ref<TimelinePoint[]>([])
const storage = ref<OverviewStorage | null>(null)
const latest = ref<OverviewLatest | null>(null)
const inventoryArtifactCount = ref(0)
const isLoadingData = ref(false)

function aggregateTimeline(data: TimelinePoint[], mode: 'day' | 'month') {
  const groups = new Map<string, TimelinePoint>()
  for (const entry of data) {
    const d = new Date(entry.timestamp)
    const key =
      mode === 'day'
        ? d.toISOString().slice(0, 10)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    groups.set(key, entry)
  }
  return Array.from(groups.values())
}

function filterLast3Months(data: TimelinePoint[]) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  return data.filter((d) => new Date(d.timestamp) >= cutoff)
}

const overviewChartOptions = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  const textColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#334155' : '#f1f5f9'

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ctx.parsed.y?.toLocaleString() ?? '',
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: {
          color: textColor,
          font: { size: 10 },
          callback: (val: string | number) => {
            const v = Number(val)
            return v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1_000
                ? `${(v / 1_000).toFixed(0)}K`
                : v
          },
        },
      },
      x: {
        grid: { display: false },
        ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
      },
    },
    elements: { point: { radius: 2 } },
  }
})

const fetchOverviewData = async () => {
  if (!genshinStore.selectedAccountId) return
  isLoadingData.value = true
  try {
    const res = await authStore.fetchWithAuth(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/overview`,
    )
    if (res.ok) {
      const json = await res.json()
      const payload = json.data ?? json
      timelineData.value = payload.timeline || []
      storage.value = payload.storage ?? null
      latest.value = payload.latest ?? null
      inventoryArtifactCount.value = payload.inventory?.artifactCount ?? 0
    }
  } catch (err) {
    console.error('Failed to fetch overview data:', err)
  } finally {
    isLoadingData.value = false
  }
}

watch(
  () => genshinStore.selectedAccountId,
  () => {
    timelineData.value = []
    storage.value = null
    latest.value = null
    inventoryArtifactCount.value = 0
    fetchOverviewData()
  },
  { immediate: true },
)

watch(
  () => genshinStore.refetchTrigger,
  () => {
    if (genshinStore.selectedAccountId) fetchOverviewData()
  },
)

const overviewTimeline = computed(() => {
  let filtered = filterLast3Months(timelineData.value)
  if (filtered.length > 60) {
    filtered = aggregateTimeline(filtered, 'month')
  } else {
    filtered = aggregateTimeline(filtered, 'day')
  }
  return filtered
})

const overviewLabels = computed(() =>
  overviewTimeline.value.map((t) => {
    const d = new Date(t.timestamp)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }),
)

function buildChart(
  label: string,
  dataKey: keyof Pick<
    TimelinePoint,
    'mora' | 'primogem' | 'totalCharacters' | 'totalArtifacts'
  >,
  borderColor: string,
  bgColor: string,
) {
  return {
    labels: overviewLabels.value,
    datasets: [
      {
        label,
        data: overviewTimeline.value.map((t) => t[dataKey]),
        borderColor,
        backgroundColor: bgColor,
        fill: true,
        tension: 0.4,
      },
    ],
  }
}

const overviewMoraChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return buildChart(
    'Mora',
    'mora',
    isDark ? '#facc15' : '#eab308',
    'rgba(234, 179, 8, 0.1)',
  )
})

const overviewPrimogemChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return buildChart(
    'Primogems',
    'primogem',
    isDark ? '#38bdf8' : '#0ea5e9',
    'rgba(14, 165, 233, 0.1)',
  )
})

const overviewCharactersChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return buildChart(
    'Characters',
    'totalCharacters',
    isDark ? '#a78bfa' : '#8b5cf6',
    'rgba(139, 92, 246, 0.1)',
  )
})

const overviewArtifactsChart = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return buildChart(
    'Artifacts',
    'totalArtifacts',
    isDark ? '#34d399' : '#10b981',
    'rgba(16, 185, 129, 0.1)',
  )
})

const displayLatest = computed(() => latest.value)

const formatDate = (d: string | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, {
    hour12: !settingsStore.use24Hour,
  })
}

const goToAccounts = () => router.push({ name: 'dashboard-accounts' })
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]">
    <div v-if="!genshinStore.selectedAccountId" class="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 transition-colors">
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">
        No account selected
      </h3>
      <p class="text-slate-500 dark:text-slate-400 mb-6">
        Select an account from the sidebar or create one to view progression.
      </p>
      <BaseButton variant="primary" @click="goToAccounts">
        Go to Accounts & Keys
      </BaseButton>
    </div>

    <div v-else-if="isLoadingData" class="flex justify-center p-12">
      <span
        class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"
      />
    </div>

    <div
      v-else-if="timelineData.length === 0"
      class="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 transition-colors"
    >
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">
        No data yet
      </h3>
      <p class="text-slate-500 dark:text-slate-400">
        Import your first GOOD JSON file using the Import Data button above to see
        progression over time.
      </p>
    </div>

    <div v-else class="space-y-8 relative z-10">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Total Characters
          </h3>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ displayLatest?.totalCharacters ?? 0 }}
          </p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Total Artifacts
          </h3>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ inventoryArtifactCount.toLocaleString() }}
          </p>
          <p
            v-if="displayLatest && displayLatest.totalArtifacts !== inventoryArtifactCount"
            class="text-xs text-slate-400 dark:text-slate-500 mt-1"
          >
            {{ displayLatest.totalArtifacts }} in latest snapshot
          </p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Last Sync
          </h3>
          <p class="text-lg font-bold text-slate-900 dark:text-white mt-2">
            {{ formatDate(displayLatest?.timestamp) }}
          </p>
        </div>
      </div>

      <div v-if="storage" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Snapshots
          </h3>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ storage.totalSnapshots.toLocaleString() }}
          </p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Raw Storage
          </h3>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">
            {{ formatBytes(storage.totalFileSize) }}
          </p>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Compressed Storage
          </h3>
          <p class="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {{ formatBytes(storage.totalCompressedFileSize) }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between">
            Mora Progression
            <span class="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-500 px-2 py-1 rounded font-bold">
              {{ displayLatest?.mora?.toLocaleString() ?? 0 }}
            </span>
          </h3>
          <div class="h-48">
            <Line :data="overviewMoraChart" :options="overviewChartOptions" />
          </div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between">
            Primogem Progression
            <span class="text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-400 px-2 py-1 rounded font-bold">
              {{ displayLatest?.primogem?.toLocaleString() ?? 0 }}
            </span>
          </h3>
          <div class="h-48">
            <Line :data="overviewPrimogemChart" :options="overviewChartOptions" />
          </div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between">
            Characters
            <span class="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-400 px-2 py-1 rounded font-bold">
              {{ displayLatest?.totalCharacters ?? 0 }}
            </span>
          </h3>
          <div class="h-48">
            <Line :data="overviewCharactersChart" :options="overviewChartOptions" />
          </div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
          <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between">
            Artifacts (snapshot)
            <span class="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 px-2 py-1 rounded font-bold">
              {{ displayLatest?.totalArtifacts ?? 0 }}
            </span>
          </h3>
          <div class="h-48">
            <Line :data="overviewArtifactsChart" :options="overviewChartOptions" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
