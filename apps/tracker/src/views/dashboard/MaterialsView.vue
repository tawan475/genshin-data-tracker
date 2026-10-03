<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import { useSettingsStore } from '../../stores/settings'
import { useAccountSettings } from '../../composables/useAccountSettings'
import MaterialPicker from '../../components/MaterialPicker.vue'
import BaseTable, { type TableLabel, type PaginationMeta } from '../../components/BaseTable.vue'
import { getMaterialIconUrl, onImageFallback } from '../../utils/assets'
import { materialChartColor, materialChartBg } from '../../utils/materials'
import type { TimelineGroupBy } from '../../types/settings'
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

interface HistorySeries {
  key: string
  name: string
  points: { timestamp: string; count: number }[]
}

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const settingsStore = useSettingsStore()
const { accountSettings, patchAccountSettings } = useAccountSettings()

const historySeries = ref<HistorySeries[]>([])
const isLoadingHistory = ref(false)

const materials = ref<{ key: string; name: string; count: number }[]>([])
const isLoadingList = ref(false)
const listSearch = ref('')
const listMeta = ref<PaginationMeta>({ page: 1, limit: 24, totalPages: 1, total: 0 })

let listSearchTimeout: ReturnType<typeof setTimeout> | null = null

const graphChartOptions = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  const textColor = isDark ? '#94a3b8' : '#64748b'
  const gridColor = isDark ? '#334155' : '#f1f5f9'

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: textColor },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y?.toLocaleString() ?? ''}`,
        },
      },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          mode: 'x' as const,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: textColor },
      },
      x: {
        grid: { color: isDark ? '#1e293b' : '#f8fafc' },
        ticks: { color: textColor, maxRotation: 45 },
      },
    },
    elements: { point: { radius: 2 } },
  }
})

const historyLabels = computed(() => {
  const first = historySeries.value[0]
  if (!first?.points.length) return []
  const groupBy = accountSettings.value.materialsGraph.groupBy
  return first.points.map((p) => {
    const d = new Date(p.timestamp)
    if (groupBy === 'year') return d.getFullYear().toString()
    if (groupBy === 'month')
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
    if (groupBy === 'hour')
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: !settingsStore.use24Hour,
      })
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
})

const historyChartData = computed(() => {
  const isDark = settingsStore.theme === 'dark'
  return {
    labels: historyLabels.value,
    datasets: historySeries.value.map((series, index) => {
      const color = materialChartColor(index, isDark)
      return {
        label: series.name,
        data: series.points.map((p) => p.count),
        borderColor: color,
        backgroundColor: materialChartBg(color),
        fill: false,
        tension: 0.3,
        borderWidth: 2,
      }
    }),
  }
})

const fetchHistory = async () => {
  const { selectedKeys, groupBy, limit } = accountSettings.value.materialsGraph
  if (!genshinStore.selectedAccountId || selectedKeys.length === 0) {
    historySeries.value = []
    return
  }

  isLoadingHistory.value = true
  try {
    const url = new URL(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/materials/history`,
    )
    url.searchParams.set('keys', selectedKeys.join(','))
    url.searchParams.set('groupBy', groupBy)
    url.searchParams.set('limit', String(limit))

    const res = await authStore.fetchWithAuth(url.toString())
    if (res.ok) {
      const parsed = await res.json()
      const data = parsed.data ?? parsed
      historySeries.value = data.series ?? []
    }
  } catch (err) {
    console.error('Failed to fetch materials history', err)
  } finally {
    isLoadingHistory.value = false
  }
}

const fetchMaterialsList = async (page = 1) => {
  if (!genshinStore.selectedAccountId) return
  isLoadingList.value = true
  try {
    const url = new URL(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/materials`,
    )
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(listMeta.value.limit))
    url.searchParams.set('sortBy', 'count')
    if (listSearch.value) url.searchParams.set('search', listSearch.value)

    const res = await authStore.fetchWithAuth(url.toString())
    if (res.ok) {
      const parsed = await res.json()
      const data = parsed.data ?? parsed
      materials.value = data.items ?? []
      if (data.meta) listMeta.value = data.meta
    }
  } catch (err) {
    console.error('Failed to fetch materials list', err)
  } finally {
    isLoadingList.value = false
  }
}

const onSelectedKeysUpdate = (keys: string[]) => {
  patchAccountSettings({ materialsGraph: { selectedKeys: keys } })
}

const onGroupByChange = (groupBy: TimelineGroupBy) => {
  patchAccountSettings({ materialsGraph: { groupBy } })
}

const onLimitChange = (limit: number) => {
  patchAccountSettings({ materialsGraph: { limit } })
}

const onListSearchInput = () => {
  if (listSearchTimeout) clearTimeout(listSearchTimeout)
  listSearchTimeout = setTimeout(() => fetchMaterialsList(1), 500)
}

watch(
  () => [
    genshinStore.selectedAccountId,
    accountSettings.value.materialsGraph.selectedKeys,
    accountSettings.value.materialsGraph.groupBy,
    accountSettings.value.materialsGraph.limit,
  ],
  () => fetchHistory(),
  { deep: true },
)

watch(
  () => genshinStore.selectedAccountId,
  () => fetchMaterialsList(1),
)

watch(() => genshinStore.refetchTrigger, () => {
  fetchHistory()
  fetchMaterialsList(listMeta.value.page)
})

onMounted(() => {
  if (genshinStore.selectedAccountId) fetchMaterialsList(1)
})

const tableLabels: TableLabel[] = [
  { key: 'icon', title: '', slot: true },
  { key: 'name', title: 'Material' },
  { key: 'count', title: 'Count', slot: true },
]
</script>

<template>
  <div v-if="genshinStore.selectedAccountId" class="max-w-7xl mx-auto space-y-8">
  <!-- History graph card -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">Material History</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track material stock over time from your snapshots.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <select
          :value="accountSettings.materialsGraph.groupBy"
          class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          @change="onGroupByChange(($event.target as HTMLSelectElement).value as TimelineGroupBy)"
        >
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
        <select
          :value="accountSettings.materialsGraph.limit"
          class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          @change="onLimitChange(Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="90">90 periods</option>
          <option :value="180">180 periods</option>
          <option :value="365">365 periods</option>
        </select>
      </div>
    </div>

    <MaterialPicker
      :selected-keys="accountSettings.materialsGraph.selectedKeys"
      @update:selected-keys="onSelectedKeysUpdate"
    />

    <div class="mt-6">
      <div v-if="isLoadingHistory" class="flex justify-center p-8">
        <span class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin" />
      </div>
      <div
        v-else-if="accountSettings.materialsGraph.selectedKeys.length === 0"
        class="text-center py-12 text-slate-400 dark:text-slate-500"
      >
        Add materials above to see history.
      </div>
      <div v-else-if="historySeries.length === 0" class="text-center py-12 text-slate-400 dark:text-slate-500">
        No history data yet.
      </div>
      <div v-else class="h-80">
        <Line :data="historyChartData" :options="graphChartOptions" />
      </div>
    </div>
  </div>

  <!-- Current inventory card -->
  <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">Current Materials</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Latest snapshot inventory.
        </p>
      </div>
      <input
        v-model="listSearch"
        type="text"
        placeholder="Search materials..."
        class="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-full sm:w-64"
        @input="onListSearchInput"
      />
    </div>

    <BaseTable
      :labels="tableLabels"
      :data="materials"
      :is-loading="isLoadingList"
      :meta="listMeta"
      @page-change="fetchMaterialsList"
      @limit-change="(limit) => { listMeta.limit = limit; fetchMaterialsList(1) }"
    >
      <template #icon="{ item }">
        <img
          v-if="getMaterialIconUrl(item.key)"
          :src="getMaterialIconUrl(item.key)"
          alt=""
          class="w-8 h-8 object-contain"
          @error="onImageFallback"
        />
        <div
          v-else
          class="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500"
        >
          {{ item.name.charAt(0) }}
        </div>
      </template>
      <template #count="{ item }">
        <span class="font-semibold tabular-nums">{{ item.count.toLocaleString() }}</span>
      </template>
    </BaseTable>
  </div>
  </div>

  <div v-else class="text-center py-16 text-slate-500 dark:text-slate-400">
    Select an account to view materials.
  </div>
</template>
