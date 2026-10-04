<script setup lang="ts">
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import { computed, watch } from 'vue'
import OverviewChartCard from '@/components/account-overview/OverviewChartCard.vue'
import OverviewStatCard from '@/components/account-overview/OverviewStatCard.vue'
import UiError from '@/components/ui/UiError.vue'
import { loadSnapshots } from '@/data/account-data'
import { progressionTimeline, type TimelinePoint } from '@/data/progression'
import { useResource } from '@/data/use-resource'
import { abbreviateTick } from '@/lib/charts'
import { formatBytes, formatFullDateTime } from '@/lib/format'
import { isDark } from '@/lib/theme'
import { useAccounts } from '@/stores/accounts'
import { useAccount } from './context'

/**
 * The original tracker's account overview: latest figures, storage, and the
 * last three months of mora, primogems, characters and artifacts, computed
 * from snapshot summaries (nothing is decoded).
 */
const account = useAccount()
const accounts = useAccounts()

// The original fetched fresh figures on every visit: pick up captures
// uploaded since the account list was loaded. A moved data version reloads
// the timeline below; a failure keeps what we have.
watch(
  () => account.value.id,
  (id) => {
    accounts.reload(id).catch(() => undefined)
  },
  { immediate: true },
)

function filterLast3Months(data: TimelinePoint[]) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  return data.filter((d) => new Date(d.timestamp) >= cutoff)
}

// Tagged with the account id, so switching accounts shows the spinner rather
// than the previous account's charts while the next one loads.
const { data, error, reload } = useResource(
  () => account.value,
  async (a) => ({
    accountId: a.id,
    // One point per day, carried forward to today (the original's request).
    // The original then collapsed more than 60 points into one per month,
    // which left 3-4 points; the daily points are kept instead.
    timeline: a.latest
      ? filterLast3Months(progressionTimeline(await loadSnapshots(a), 'day', 90))
      : [],
  }),
)
const overviewTimeline = computed(() => {
  const value = data.value
  return value && value.accountId === account.value.id ? value.timeline : undefined
})

/** Newest point: its mora and primogems are carried over when the latest capture missed them. */
const latestPoint = computed(() => {
  const timeline = overviewTimeline.value
  return timeline?.[timeline.length - 1]
})

/** The newest capture: the latest snapshot, or a later sighting of the same inventory. */
const lastSync = computed(() => {
  const latest = account.value.latest
  if (!latest) return '—'
  return formatFullDateTime(Math.max(latest.takenAt, latest.lastSeenAt))
})

const overviewChartOptions = computed<ChartOptions<'line'>>(() => {
  const textColor = isDark.value ? '#94a3b8' : '#64748b'
  const gridColor = isDark.value ? '#334155' : '#f1f5f9'

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => ctx.parsed.y?.toLocaleString() ?? '',
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
          callback: abbreviateTick,
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

const overviewLabels = computed(() =>
  (overviewTimeline.value ?? []).map((t) => {
    const d = new Date(t.timestamp)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }),
)

function buildChart(
  label: string,
  dataKey: keyof Pick<TimelinePoint, 'mora' | 'primogem' | 'totalCharacters' | 'totalArtifacts'>,
  borderColor: string,
  bgColor: string,
): ChartData<'line'> {
  return {
    labels: overviewLabels.value,
    datasets: [
      {
        label,
        data: (overviewTimeline.value ?? []).map((t) => t[dataKey]),
        borderColor,
        backgroundColor: bgColor,
        fill: true,
        tension: 0.4,
      },
    ],
  }
}

const overviewMoraChart = computed(() =>
  buildChart('Mora', 'mora', isDark.value ? '#facc15' : '#eab308', 'rgba(234, 179, 8, 0.1)'),
)

const overviewPrimogemChart = computed(() =>
  buildChart(
    'Primogems',
    'primogem',
    isDark.value ? '#38bdf8' : '#0ea5e9',
    'rgba(14, 165, 233, 0.1)',
  ),
)

const overviewCharactersChart = computed(() =>
  buildChart(
    'Characters',
    'totalCharacters',
    isDark.value ? '#a78bfa' : '#8b5cf6',
    'rgba(139, 92, 246, 0.1)',
  ),
)

const overviewArtifactsChart = computed(() =>
  buildChart(
    'Artifacts',
    'totalArtifacts',
    isDark.value ? '#34d399' : '#10b981',
    'rgba(16, 185, 129, 0.1)',
  ),
)
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-8 relative min-h-[60vh]">
    <div
      v-if="!account.latest"
      class="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 transition-colors"
    >
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No data yet</h3>
      <p class="text-slate-500 dark:text-slate-400">
        Import your first GOOD JSON file using the Import Data button above to see progression over
        time.
      </p>
    </div>

    <UiError
      v-else-if="error && !overviewTimeline"
      class="mt-8"
      title="Overview unavailable"
      :error="error"
      @retry="reload"
    />

    <div v-else-if="!overviewTimeline" class="flex justify-center p-12">
      <span
        class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"
        role="status"
        aria-label="Loading"
      />
    </div>

    <div v-else class="space-y-8 relative z-10">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <OverviewStatCard label="Total Characters">
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ account.latest.summary.characters }}
          </p>
        </OverviewStatCard>
        <OverviewStatCard label="Total Artifacts">
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ account.latest.summary.artifacts.toLocaleString() }}
          </p>
        </OverviewStatCard>
        <OverviewStatCard label="Last Sync">
          <p class="text-lg font-bold text-slate-900 dark:text-white mt-2">
            {{ lastSync }}
          </p>
        </OverviewStatCard>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OverviewStatCard label="Snapshots">
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ account.snapshotCount.toLocaleString() }}
          </p>
        </OverviewStatCard>
        <OverviewStatCard label="Raw Storage">
          <p class="text-2xl font-bold text-slate-900 dark:text-white">
            {{ formatBytes(account.rawBytes) }}
          </p>
        </OverviewStatCard>
        <OverviewStatCard label="Compressed Storage">
          <p class="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {{ formatBytes(account.storedBytes) }}
          </p>
        </OverviewStatCard>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OverviewChartCard
          title="Mora Progression"
          :badge="latestPoint?.mora.toLocaleString() ?? 0"
          badge-class="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-500"
          :data="overviewMoraChart"
          :options="overviewChartOptions"
        />
        <OverviewChartCard
          title="Primogem Progression"
          :badge="latestPoint?.primogem.toLocaleString() ?? 0"
          badge-class="bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-400"
          :data="overviewPrimogemChart"
          :options="overviewChartOptions"
        />
        <OverviewChartCard
          title="Characters"
          :badge="account.latest.summary.characters"
          badge-class="bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-400"
          :data="overviewCharactersChart"
          :options="overviewChartOptions"
        />
        <OverviewChartCard
          title="Artifacts (snapshot)"
          :badge="account.latest.summary.artifacts.toLocaleString()"
          badge-class="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400"
          :data="overviewArtifactsChart"
          :options="overviewChartOptions"
        />
      </div>
    </div>
  </div>
</template>
