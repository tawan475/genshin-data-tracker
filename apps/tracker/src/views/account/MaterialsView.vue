<script setup lang="ts">
import '@/lib/charts'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import type { TimelineGroupBy } from '@gdt/shared'
import BaseTable, { type PaginationMeta, type TableLabel } from '@/components/legacy/BaseTable.vue'
import { historyPeriods, historySeries } from '@/components/material-history/history-series'
import MaterialHistoryPicker from '@/components/material-history/MaterialHistoryPicker.vue'
import MaterialTile from '@/components/material-history/MaterialTile.vue'
import { materialChartBg, materialChartColor } from '@/components/material-history/palette'
import { useMaterialHistorySettings } from '@/components/material-history/use-material-history-settings'
import { useMaterialIcons } from '@/components/materials/use-material-icons'
import { loadMaterialsHistory } from '@/data/materials'
import { periodLabel } from '@/data/progression'
import { useResource } from '@/data/use-resource'
import { isDark } from '@/lib/theme'
import { useFeedback } from '@/stores/feedback'
import { isPlayerProperty, materialMatcher, materialName } from '@/utils/materials'
import { useAccount } from './context'

const account = useAccount()
const feedback = useFeedback()
const icon = useMaterialIcons()
const settings = useMaterialHistorySettings(() => account.value.id)

const history = useResource(
  () => account.value,
  (a) => (a.latest ? loadMaterialsHistory(a) : Promise.resolve(null)),
)
watch(history.error, (error) => {
  if (error) feedback.error('Could not load materials', error)
})
const isLoadingData = computed(() => history.data.value === undefined && !history.error.value)

/** Every material in this account's snapshots (player properties aside), for the picker. */
const pickerOptions = computed(() => {
  const data = history.data.value
  if (!data) return []
  return [...data.series.keys()]
    .filter((key) => !isPlayerProperty(key))
    .map((key) => ({ key, name: materialName(key) }))
})

// ------------------------------------------------------------------- history

const periods = computed(() => {
  const data = history.data.value
  if (!data) return []
  return historyPeriods(data.times, settings.groupBy.value, settings.limit.value)
})

const series = computed(() => {
  const data = history.data.value
  if (!data || periods.value.length === 0) return []
  return historySeries(data, settings.selectedKeys.value, periods.value)
})

const isLoadingHistory = computed(
  () => !settings.ready.value || (settings.selectedKeys.value.length > 0 && isLoadingData.value),
)

const graphChartOptions = computed(() => {
  const dark = isDark.value
  const textColor = dark ? '#94a3b8' : '#64748b'
  const gridColor = dark ? '#334155' : '#f1f5f9'

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
        grid: { color: dark ? '#1e293b' : '#f8fafc' },
        ticks: { color: textColor, maxRotation: 45 },
      },
    },
    elements: { point: { radius: 2 } },
  }
})

const historyChartData = computed(() => ({
  labels: periods.value.map((p) => periodLabel(p.timestamp, settings.groupBy.value)),
  datasets: series.value.map((s, index) => {
    const color = materialChartColor(index)
    return {
      label: s.name,
      data: s.points.map((p) => p.count),
      borderColor: color,
      backgroundColor: materialChartBg(color),
      fill: false,
      tension: 0.3,
      borderWidth: 2,
    }
  }),
}))

const onSelectedKeysUpdate = (keys: string[]) => {
  settings.patch({ selectedKeys: keys })
}

const onGroupByChange = (groupBy: TimelineGroupBy) => {
  settings.patch({ groupBy })
}

const onLimitChange = (limit: number) => {
  settings.patch({ limit })
}

// ----------------------------------------------------------------- inventory

const listSearch = ref('')
const appliedSearch = ref('')
const listPage = ref(1)
const listLimit = ref(24)

let listSearchTimeout: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (listSearchTimeout) clearTimeout(listSearchTimeout)
})

const onListSearchInput = () => {
  if (listSearchTimeout) clearTimeout(listSearchTimeout)
  listSearchTimeout = setTimeout(() => {
    appliedSearch.value = listSearch.value
    listPage.value = 1
  }, 500)
}

/** The newest snapshot's materials, most first. */
const currentMaterials = computed(() => {
  const latest = history.data.value?.latest
  if (!latest) return []
  const items: { key: string; name: string; count: number }[] = []
  for (const [key, count] of latest) {
    if (!isPlayerProperty(key)) items.push({ key, name: materialName(key), count })
  }
  return items.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const filteredMaterials = computed(() => {
  const match = materialMatcher(appliedSearch.value)
  if (!match) return currentMaterials.value
  return currentMaterials.value.filter((item) => match(item.name) || match(item.key))
})

const listMeta = computed<PaginationMeta>(() => {
  const total = filteredMaterials.value.length
  const totalPages = Math.ceil(total / listLimit.value) || 1
  return { page: Math.min(listPage.value, totalPages), limit: listLimit.value, totalPages, total }
})

const materials = computed(() => {
  const { page, limit } = listMeta.value
  return filteredMaterials.value.slice((page - 1) * limit, page * limit)
})

const onPageChange = (page: number) => {
  listPage.value = page
}

const onLimitChangeList = (limit: number) => {
  listLimit.value = limit
  listPage.value = 1
}

// A new account starts on the first page with no search.
watch(
  () => account.value.id,
  () => {
    listSearch.value = ''
    appliedSearch.value = ''
    listPage.value = 1
  },
)

const tableLabels: TableLabel[] = [
  { key: 'icon', title: '', slot: true },
  { key: 'name', title: 'Material' },
  { key: 'count', title: 'Count', slot: true },
]
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8">
    <!-- History graph card -->
    <div
      class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
    >
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">Material History</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track material stock over time from your snapshots.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <select
            :value="settings.groupBy.value"
            aria-label="Group by"
            class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            @change="onGroupByChange(($event.target as HTMLSelectElement).value as TimelineGroupBy)"
          >
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
          <select
            :value="settings.limit.value"
            aria-label="Periods"
            class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            @change="onLimitChange(Number(($event.target as HTMLSelectElement).value))"
          >
            <option :value="90">90 periods</option>
            <option :value="180">180 periods</option>
            <option :value="365">365 periods</option>
          </select>
        </div>
      </div>

      <MaterialHistoryPicker
        :key="account.id"
        :selected-keys="settings.selectedKeys.value"
        :options="pickerOptions"
        :is-searching="isLoadingData"
        :icon="icon"
        @update:selected-keys="onSelectedKeysUpdate"
      />

      <div class="mt-6">
        <div v-if="isLoadingHistory" class="flex justify-center p-8">
          <span
            class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"
          />
        </div>
        <div
          v-else-if="settings.selectedKeys.value.length === 0"
          class="text-center py-12 text-slate-400 dark:text-slate-500"
        >
          Add materials above to see history.
        </div>
        <div
          v-else-if="series.length === 0"
          class="text-center py-12 text-slate-400 dark:text-slate-500"
        >
          No history data yet.
        </div>
        <div v-else class="h-80">
          <Line :data="historyChartData" :options="graphChartOptions" />
        </div>
      </div>
    </div>

    <!-- Current inventory card -->
    <div
      class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">Current Materials</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Latest snapshot inventory.</p>
        </div>
        <input
          v-model="listSearch"
          type="text"
          placeholder="Search materials..."
          aria-label="Search materials"
          class="px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-full sm:w-64"
          @input="onListSearchInput"
        />
      </div>

      <BaseTable
        :labels="tableLabels"
        :data="materials"
        :is-loading="isLoadingData"
        :meta="listMeta"
        @page-change="onPageChange"
        @limit-change="onLimitChangeList"
      >
        <template #icon="{ item }">
          <MaterialTile :src="icon(item.key)" :name="item.name" />
        </template>
        <template #count="{ item }">
          <span class="font-semibold tabular-nums">{{ item.count.toLocaleString() }}</span>
        </template>
      </BaseTable>
    </div>
  </div>
</template>
