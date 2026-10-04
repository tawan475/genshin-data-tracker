<script setup lang="ts">
import type { TimelineGroupBy } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import { loadSnapshots } from '@/data/account-data'
import { GROUP_BY_OPTIONS, periodLabel, progressionTimeline } from '@/data/progression'
import { useResource } from '@/data/use-resource'
import { abbreviateTick } from '@/lib/charts'
import { isDark } from '@/lib/theme'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from '@/views/account/context'

const account = useAccount()
const feedback = useFeedback()

// Detail Data
const detailGroupBy = ref<TimelineGroupBy>('day')
const detailLimit = ref(365)

const snapshots = useResource(
  () => account.value,
  async (a) => ({ accountId: a.id, list: await loadSnapshots(a) }),
)
watch(snapshots.error, (error) => {
  if (error) feedback.error('Could not load progression', error)
})

/** Spinner on first load and while switching accounts, not on a refresh. */
const isLoadingDetailData = computed(
  () =>
    snapshots.loading.value &&
    (!snapshots.data.value || snapshots.data.value.accountId !== account.value.id),
)

const detailTimelineData = computed(() =>
  snapshots.data.value
    ? progressionTimeline(snapshots.data.value.list, detailGroupBy.value, detailLimit.value)
    : [],
)

// ─── Detail chart config (larger) ───
const detailChartOptions = computed(() => {
  const textColor = isDark.value ? '#94a3b8' : '#64748b' // slate-400 : slate-500
  const gridColor = isDark.value ? '#334155' : '#f1f5f9' // slate-700 : slate-100

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number | null } }) => ctx.parsed.y?.toLocaleString() ?? '',
        },
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
            enabled: true,
          },
          mode: 'x' as const,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: textColor, callback: abbreviateTick },
      },
      x: {
        grid: { color: isDark.value ? '#1e293b' : '#f8fafc' }, // slate-800 : slate-50
        ticks: { color: textColor, maxRotation: 45 },
      },
    },
    elements: { point: { radius: 3 } },
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
        beginAtZero: false,
      },
    },
  }
})

// ─── Detail computed ───
const detailLabels = computed(() =>
  detailTimelineData.value.map((t) => periodLabel(t.timestamp, detailGroupBy.value)),
)

const detailMoraChart = computed(() => ({
  labels: detailLabels.value,
  datasets: [
    {
      label: 'Mora',
      data: detailTimelineData.value.map((t) => t.mora),
      borderColor: isDark.value ? '#facc15' : '#eab308', // yellow-400 : yellow-500
      backgroundColor: 'rgba(234, 179, 8, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2,
    },
  ],
}))

const detailPrimogemChart = computed(() => ({
  labels: detailLabels.value,
  datasets: [
    {
      label: 'Primogems',
      data: detailTimelineData.value.map((t) => t.primogem),
      borderColor: isDark.value ? '#38bdf8' : '#0ea5e9', // sky-400 : sky-500
      backgroundColor: 'rgba(14, 165, 233, 0.08)',
      fill: true,
      tension: 0.3,
      borderWidth: 2,
    },
  ],
}))

const detailMoraDiffChart = computed(() => {
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.mora - arr[i - 1]!.mora
  })
  return {
    labels: detailLabels.value,
    datasets: [
      {
        label: 'Mora Diff',
        data,
        borderColor: isDark.value ? '#facc15' : '#ca8a04', // yellow-400 : yellow-600
        backgroundColor: 'rgba(202, 138, 4, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  }
})

const detailPrimogemDiffChart = computed(() => {
  const data = detailTimelineData.value.map((t, i, arr) => {
    if (i === 0) return 0
    return t.primogem - arr[i - 1]!.primogem
  })
  return {
    labels: detailLabels.value,
    datasets: [
      {
        label: 'Primogem Diff',
        data,
        borderColor: isDark.value ? '#38bdf8' : '#0284c7', // sky-400 : sky-600
        backgroundColor: 'rgba(2, 132, 199, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  }
})

const latestPoint = computed(() => detailTimelineData.value[detailTimelineData.value.length - 1])
</script>

<template>
  <!-- Detailed Progression Section -->
  <div
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 relative z-10 transition-colors"
  >
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <h3 class="text-lg font-bold text-slate-900 dark:text-white transition-colors">
        Detailed Progression
      </h3>

      <div class="flex flex-wrap items-center gap-4">
        <!-- Group By -->
        <div class="flex items-center gap-2">
          <label
            for="detail-group-by"
            class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors"
            >Group by</label
          >
          <select
            id="detail-group-by"
            v-model="detailGroupBy"
            class="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
          >
            <option v-for="option in GROUP_BY_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <!-- Zoom Instructions -->
        <div class="flex items-center gap-3">
          <span
            class="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded flex items-center gap-2 transition-colors"
          >
            <svg
              class="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              ></path>
            </svg>
            Scroll to zoom, drag to pan
          </span>
        </div>
      </div>
    </div>

    <div v-if="isLoadingDetailData" class="flex justify-center p-8">
      <span
        class="w-6 h-6 border-3 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"
      ></span>
    </div>
    <div
      v-else-if="detailTimelineData.length === 0"
      class="text-center py-8 text-slate-400 dark:text-slate-500 transition-colors"
    >
      No data for the selected range.
    </div>
    <div v-else class="space-y-6">
      <!-- Mora Charts -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="min-w-0">
          <h4
            class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors"
          >
            Mora Total
            <span
              class="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-500 px-2 py-1 rounded font-bold transition-colors"
            >
              {{ latestPoint?.mora?.toLocaleString() }}
            </span>
          </h4>
          <div class="h-72">
            <Line :data="detailMoraChart" :options="detailChartOptions" />
          </div>
        </div>
        <div class="min-w-0">
          <h4
            class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors"
          >
            Mora Gain/Loss
          </h4>
          <div class="h-72">
            <Line :data="detailMoraDiffChart" :options="detailDiffChartOptions" />
          </div>
        </div>
      </div>

      <!-- Primogem Charts -->
      <div
        class="pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6 transition-colors"
      >
        <div class="min-w-0">
          <h4
            class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors"
          >
            Primogems Total
            <span
              class="text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-400 px-2 py-1 rounded font-bold transition-colors"
            >
              {{ latestPoint?.primogem?.toLocaleString() }}
            </span>
          </h4>
          <div class="h-72">
            <Line :data="detailPrimogemChart" :options="detailChartOptions" />
          </div>
        </div>
        <div class="min-w-0">
          <h4
            class="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center justify-between transition-colors"
          >
            Primogems Gain/Loss
          </h4>
          <div class="h-72">
            <Line :data="detailPrimogemDiffChart" :options="detailDiffChartOptions" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
