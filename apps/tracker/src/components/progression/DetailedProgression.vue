<script setup lang="ts">
import type { TimelineGroupBy } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { useChartRange } from '@/components/charts/use-chart-range'
import ChangeValue from '@/components/overview/ChangeValue.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { axisFormat, fitGroupBy, formatWindow, groupFits } from '@/data/chart-range'
import type { Capture } from '@/data/overview'
import { GROUP_BY_OPTIONS, nextPeriod } from '@/data/progression'
import { clock24, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import type { ChangeBar } from './ChangeBarChart.vue'
import ChangeBarChart from './ChangeBarChart.vue'
import {
  buildProgression,
  MAX_PERIODS,
  periodTick,
  periodTitle,
  periodTotals,
  type CurrencyKey,
} from './progression-series'

/**
 * Mora and primogems per period: the value as a stepped line and the gain or
 * loss of each period as columns. Group-by and range are remembered on this
 * device. A grouping too coarse for the range is greyed out and the next
 * finer one shown (6h is per hour), the choice coming back with a longer
 * range. `captures` is undefined while the history loads.
 */
const props = defineProps<{ captures: Capture[] | undefined }>()

const CHARTS: { key: CurrencyKey; title: string; color: TimelineSeries['color'] }[] = [
  { key: 'mora', title: 'Mora', color: 2 },
  { key: 'primogem', title: 'Primogems', color: 4 },
]

const PER: Record<TimelineGroupBy, { label: string; one: string; many: string }> = {
  hour: { label: 'Per hour', one: 'hour', many: 'hours' },
  day: { label: 'Per day', one: 'day', many: 'days' },
  month: { label: 'Per month', one: 'month', many: 'months' },
  year: { label: 'Per year', one: 'year', many: 'years' },
}

const GROUP_KEY = 'progression-group-by'
const storedGroup = readStorage(GROUP_KEY)
const chosenGroup = ref<TimelineGroupBy>(
  GROUP_BY_OPTIONS.find((o) => o.value === storedGroup)?.value ?? 'day',
)
watch(chosenGroup, (value) => writeStorage(GROUP_KEY, value))
const range = useChartRange('progression-range')

/** The grouping in use: the choice, or a finer one when the range is too short for it. */
const groupBy = computed<TimelineGroupBy>({
  get: () => fitGroupBy(range.value, chosenGroup.value),
  set: (value) => (chosenGroup.value = value),
})
const groupOptions = computed<SegmentedOption<TimelineGroupBy>[]>(() =>
  GROUP_BY_OPTIONS.map((option) =>
    groupFits(range.value, option.value)
      ? option
      : { ...option, disabled: true, title: 'Longer than the range' },
  ),
)

const progression = computed(() =>
  props.captures ? buildProgression(props.captures, groupBy.value, range.value) : null,
)

interface ChartView {
  key: CurrencyKey
  title: string
  value: string
  net: number
  gained: number
  spent: number
  series: TimelineSeries[]
  lineLabel: string
  bars: ChangeBar[]
  barsLabel: string
}

// Labels for the periods are shared by both charts.
const periodLabels = computed(() => {
  const p = progression.value
  if (!p) return []
  const hour12 = !clock24()
  const first = p.periods[0]
  const last = p.periods[p.periods.length - 1]
  const axis =
    first && last ? axisFormat(nextPeriod(last.start, groupBy.value) - first.start) : 'date'
  return p.periods.map((period) => ({
    tick: periodTick(period.start, groupBy.value, hour12, axis),
    title: periodTitle(period.start, groupBy.value, hour12),
    captures:
      period.captures === 0
        ? 'No captures'
        : `${formatNumber(period.captures)} ${period.captures === 1 ? 'capture' : 'captures'}`,
  }))
})

/** The window both charts cover, for the range tooltip and the charts' accessible names. */
const span = computed(() => {
  const p = progression.value
  const first = p?.lines.mora[0]
  const last = p?.lines.mora[p.lines.mora.length - 1]
  return first && last ? formatWindow(first.x, last.x, !clock24()) : ''
})

const per = computed(() => PER[groupBy.value])

/** Tooltip on the "Per day" label; says so when older periods were left out. */
const perDetail = computed(() => {
  const detail = `Change against the previous ${per.value.one}`
  return progression.value?.truncated
    ? `${detail} · newest ${formatNumber(MAX_PERIODS)} ${per.value.many}`
    : detail
})

const charts = computed<ChartView[]>(() => {
  const p = progression.value
  if (!p) return []
  const labels = periodLabels.value
  return CHARTS.map((def) => {
    const totals = periodTotals(p, def.key)
    const value = formatNumber(totals.last)
    return {
      key: def.key,
      title: def.title,
      value,
      net: totals.net,
      gained: totals.gained,
      spent: totals.spent,
      series: [{ label: def.title, color: def.color, points: p.lines[def.key] }],
      lineLabel: `${def.title} over time, ${span.value}. Latest ${value}.`,
      bars: p.periods.map((period, i) => ({
        tick: labels[i]!.tick,
        title: labels[i]!.title,
        value: period.change[def.key],
        detail: [`Total ${formatNumber(period.close[def.key])}`, labels[i]!.captures],
      })),
      barsLabel: `${def.title} change ${per.value.label.toLowerCase()}, ${span.value}: gained ${formatNumber(
        totals.gained,
      )}, spent ${formatNumber(totals.spent)}.`,
    }
  })
})
</script>

<template>
  <UiPanel title="Detailed progression">
    <template #actions>
      <UiSegmented v-model="groupBy" :options="groupOptions" label="Group by" />
      <ChartRangeSelect v-model="range" :detail="span || undefined" />
    </template>

    <div v-if="!captures" class="grid gap-8 lg:grid-cols-2" role="status">
      <span class="sr-only">Loading progression</span>
      <div v-for="n in 2" :key="n" class="flex flex-col gap-3">
        <div class="flex justify-between gap-4">
          <UiSkeleton class="h-6 w-24" />
          <UiSkeleton class="h-6 w-32" />
        </div>
        <UiSkeleton class="h-[220px] w-full" />
        <UiSkeleton class="mt-2 h-[150px] w-full" />
      </div>
    </div>

    <p v-else-if="!progression" class="py-6 text-center text-text-secondary">No currency data</p>

    <div v-else class="grid gap-8 lg:grid-cols-2">
      <section
        v-for="chart in charts"
        :key="chart.key"
        class="min-w-0"
        :aria-labelledby="`progression-${chart.key}`"
      >
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 :id="`progression-${chart.key}`" class="font-display text-lg font-bold">
            {{ chart.title }}
          </h3>
          <p class="flex items-baseline gap-2">
            <span class="tabular font-mono font-medium">{{ chart.value }}</span>
            <ChangeValue :value="chart.net" hint="in this range" class="text-sm" />
          </p>
        </div>
        <TimelineChart :series="chart.series" :label="chart.lineLabel" :height="220" fill stepped />

        <div class="mt-5 mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h4 class="text-sm font-medium text-text-secondary" :title="perDetail">
            {{ per.label }}
          </h4>
          <p class="flex items-baseline gap-3 text-sm">
            <ChangeValue :value="chart.gained" hint="gained in this range" />
            <ChangeValue :value="-chart.spent" hint="spent in this range" />
          </p>
        </div>
        <ChangeBarChart
          :bars="chart.bars"
          :name="chart.title"
          :label="chart.barsLabel"
          :height="150"
        />
      </section>
    </div>
  </UiPanel>
</template>
