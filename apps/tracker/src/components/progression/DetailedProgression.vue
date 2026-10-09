<script setup lang="ts">
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { useChartRange } from '@/components/charts/use-chart-range'
import ChangeValue from '@/components/overview/ChangeValue.vue'
import { Settings } from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { axisFormat, fitGroupBy, formatWindow, groupFits } from '@/data/chart-range'
import type { Capture, Point } from '@/data/overview'
import { GROUP_BY_OPTIONS, nextPeriod } from '@/data/progression'
import { clock24, formatDateTime, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import type { ChangeBar } from './ChangeBarChart.vue'
import ChangeBarChart from './ChangeBarChart.vue'
import {
  buildProgression,
  buildSnapshotProgression,
  defaultGroup,
  MAX_PERIODS,
  periodTick,
  periodTitle,
  periodTotals,
  SNAPSHOT_BAR_WIDTH,
  snapshotTotals,
  FIGURE_KEYS,
  type FigureKey,
  type PeriodTotals,
  type ProgressionGroup,
} from './progression-series'

/**
 * A report card of the figures picked on it (mora, primogems, artifacts, 4★ /
 * 3★ artifacts, characters, weapons): each figure's value as a stepped line
 * and its gains and losses under it as columns, per snapshot (each capture
 * that changed the figure, under its step on the same time axis) or per
 * period. The figures (picked under the cog beside the range), group-by and
 * range are remembered on this device per
 * card (`storage`); until a grouping is picked, ranges up to a week show
 * snapshots and longer ones days. A period too coarse for the range is
 * greyed out and the next finer one shown (6h is per hour), the choice
 * coming back with a longer range. `captures` is undefined while the
 * history loads.
 */
const props = withDefaults(
  defineProps<{
    captures: Capture[] | undefined
    title?: string
    /** Storage key prefix for this card's choices (figures, group-by, range). */
    storage?: string
    /** Figures shown until some are picked. */
    defaults?: readonly FigureKey[]
    /** The grouping until one is picked (else per snapshot up to a week, per day beyond). */
    defaultGroup?: ProgressionGroup
  }>(),
  {
    title: 'Detailed progression',
    storage: 'progression',
    defaults: () => ['mora', 'primogem'],
    defaultGroup: undefined,
  },
)

const FIGURES: Record<FigureKey, { title: string; color: TimelineSeries['color'] }> = {
  mora: { title: 'Mora', color: 2 },
  primogem: { title: 'Primogems', color: 4 },
  artifacts: { title: 'Artifacts', color: 5 },
  artifact4: { title: '4★ Artifact', color: 6 },
  artifact3: { title: '3★ Artifact', color: 3 },
  characters: { title: 'Characters', color: 1 },
  weapons: { title: 'Weapons', color: 3 },
}

/** The figures picked on this card (in FIGURE_KEYS order), remembered per device. */
const FIGURES_KEY = `${props.storage}-figures`
const storedFigures = (readStorage(FIGURES_KEY) ?? '')
  .split(',')
  .filter((key): key is FigureKey => (FIGURE_KEYS as readonly string[]).includes(key))
const picked = ref<FigureKey[]>(storedFigures.length ? storedFigures : [...props.defaults])
function toggleFigure(key: FigureKey) {
  const on = picked.value.includes(key)
  if (on && picked.value.length === 1) return // at least one
  picked.value = FIGURE_KEYS.filter((k) => (k === key ? !on : picked.value.includes(k)))
  writeStorage(FIGURES_KEY, picked.value.join(','))
}
const CHARTS = computed(() => picked.value.map((key) => ({ key, ...FIGURES[key] })))
/** The figure chips show only while the cog beside the range is on. */
const picking = ref(false)

const PER: Record<ProgressionGroup, { label: string; one: string; many: string }> = {
  snapshot: { label: 'Per snapshot', one: 'snapshot', many: 'snapshots' },
  hour: { label: 'Per hour', one: 'hour', many: 'hours' },
  day: { label: 'Per day', one: 'day', many: 'days' },
  month: { label: 'Per month', one: 'month', many: 'months' },
  year: { label: 'Per year', one: 'year', many: 'years' },
}

const GROUPS: SegmentedOption<ProgressionGroup>[] = [
  { value: 'snapshot', label: 'Snapshot' },
  ...GROUP_BY_OPTIONS,
]

/** Room after both plots for half the widest snapshot bar, at the newest capture. */
const PAD_RIGHT = SNAPSHOT_BAR_WIDTH.max / 2

const GROUP_KEY = `${props.storage}-group-by`
const storedGroup = readStorage(GROUP_KEY)
/** The grouping picked on this device; none until the control is used. */
const chosenGroup = ref<ProgressionGroup | null>(
  GROUPS.find((o) => o.value === storedGroup)?.value ?? props.defaultGroup ?? null,
)
watch(chosenGroup, (value) => value && writeStorage(GROUP_KEY, value))
const range = useChartRange(`${props.storage}-range`)

/** The grouping in use: the choice (or default), or a finer period when the range is too short for it. */
const groupBy = computed<ProgressionGroup>({
  get: () => {
    const choice = chosenGroup.value ?? defaultGroup(range.value)
    return choice === 'snapshot' ? choice : fitGroupBy(range.value, choice)
  },
  set: (value) => (chosenGroup.value = value),
})
const groupOptions = computed<SegmentedOption<ProgressionGroup>[]>(() =>
  GROUPS.map((option) =>
    option.value === 'snapshot' || groupFits(range.value, option.value)
      ? option
      : { ...option, disabled: true, title: 'Longer than the range' },
  ),
)

const groupRow = useTemplateRef<HTMLElement>('groupRow')
/** On a phone the five options scroll sideways: keep the one in use in view. */
function revealGroup() {
  const row = groupRow.value
  const chosen = row?.querySelector('[aria-checked="true"]')
  if (!row || !chosen) return
  const bounds = row.getBoundingClientRect()
  const option = chosen.getBoundingClientRect()
  if (option.right > bounds.right) row.scrollLeft += option.right - bounds.right
  else if (option.left < bounds.left) row.scrollLeft -= bounds.left - option.left
}
onMounted(revealGroup)
watch(groupBy, revealGroup, { flush: 'post' })

const periodic = computed(() => {
  const group = groupBy.value
  return props.captures && group !== 'snapshot'
    ? buildProgression(props.captures, group, range.value)
    : null
})
const perSnapshot = computed(() =>
  props.captures && groupBy.value === 'snapshot'
    ? buildSnapshotProgression(props.captures, range.value)
    : null,
)

/** Whichever grouping is in use, or null without currency data. */
const shown = computed<{ lines: Record<FigureKey, Point[]>; truncated: boolean } | null>(
  () => perSnapshot.value ?? periodic.value,
)

interface ChartView {
  key: FigureKey
  title: string
  value: string
  net: number
  gained: number
  spent: number
  series: TimelineSeries[]
  lineLabel: string
  bars: ChangeBar[]
  /** The line's time axis, for bars standing under its steps (per snapshot). */
  domain?: [number, number]
  barsLabel: string
}

// Labels for the periods are shared by both charts.
const periodLabels = computed(() => {
  const p = periodic.value
  const group = groupBy.value
  if (!p || group === 'snapshot') return []
  const hour12 = !clock24()
  const first = p.periods[0]
  const last = p.periods[p.periods.length - 1]
  const axis = first && last ? axisFormat(nextPeriod(last.start, group) - first.start) : 'date'
  return p.periods.map((period) => ({
    tick: periodTick(period.start, group, hour12, axis),
    title: periodTitle(period.start, group, hour12),
    captures:
      period.captures === 0
        ? 'No captures'
        : `${formatNumber(period.captures)} ${period.captures === 1 ? 'capture' : 'captures'}`,
  }))
})

/** The window both charts cover, for the range tooltip and the charts' accessible names. */
const span = computed(() => {
  const line = shown.value?.lines[picked.value[0] ?? 'mora']
  const first = line?.[0]
  const last = line?.[line.length - 1]
  return first && last ? formatWindow(first.x, last.x, !clock24()) : ''
})

const per = computed(() => PER[groupBy.value])

/** Tooltip on the "Per day" label; says so when older bars were left out. */
const perDetail = computed(() => {
  const detail = `Change against the previous ${per.value.one}`
  return shown.value?.truncated
    ? `${detail} · newest ${formatNumber(MAX_PERIODS)} ${per.value.many}`
    : detail
})

/** The bars and totals of one figure, per period or per snapshot. */
function barsOf(key: FigureKey): { bars: ChangeBar[]; totals: PeriodTotals } | null {
  const s = perSnapshot.value
  if (s) {
    return {
      totals: snapshotTotals(s, key),
      bars: s.changes[key].map((c) => ({
        x: c.at,
        title: formatDateTime(c.at),
        value: c.change,
        detail: [`Total ${formatNumber(c.value)}`],
      })),
    }
  }
  const p = periodic.value
  if (!p) return null
  const labels = periodLabels.value
  return {
    totals: periodTotals(p, key),
    bars: p.periods.map((period, i) => ({
      tick: labels[i]!.tick,
      title: labels[i]!.title,
      value: period.change[key],
      detail: [`Total ${formatNumber(period.close[key])}`, labels[i]!.captures],
    })),
  }
}

const charts = computed<ChartView[]>(() => {
  const lines = shown.value?.lines
  if (!lines) return []
  return CHARTS.value.flatMap((def) => {
    const figure = barsOf(def.key)
    if (!figure) return []
    const { bars, totals } = figure
    const value = formatNumber(totals.last)
    return {
      key: def.key,
      title: def.title,
      value,
      net: totals.net,
      gained: totals.gained,
      spent: totals.spent,
      series: [{ label: def.title, color: def.color, points: lines[def.key] }],
      lineLabel: `${def.title} over time, ${span.value}. Latest ${value}.`,
      bars,
      domain: perSnapshot.value?.domain,
      barsLabel: `${def.title} change ${per.value.label.toLowerCase()}, ${span.value}: gained ${formatNumber(
        totals.gained,
      )}, spent ${formatNumber(totals.spent)}.`,
    }
  })
})

/**
 * Each chart's own y-axis width, by figure and chart: the line and its bars
 * both take the wider, so their plots start and end at the same x and the
 * snapshot bars stand under their steps.
 */
const axisFits = reactive<Record<string, number>>({})
const yAxisWidth = (key: FigureKey) =>
  Math.max(axisFits[`${key}-line`] ?? 0, axisFits[`${key}-bars`] ?? 0)
function fitAxis(id: string, width: number) {
  if (axisFits[id] !== width) axisFits[id] = width
}
</script>

<template>
  <UiPanel :title="title">
    <template #actions>
      <div
        ref="groupRow"
        class="scroll-hide scroll-fade-x max-w-full min-w-0 overflow-x-auto sm:scroll-fade-none sm:overflow-visible"
      >
        <UiSegmented v-model="groupBy" :options="groupOptions" label="Group by" />
      </div>
      <UiIconButton label="Figures" :active="picking" @click="picking = !picking">
        <Settings class="size-5" aria-hidden="true" />
      </UiIconButton>
      <ChartRangeSelect v-model="range" :detail="span || undefined" />
    </template>

    <!-- Which figures this card charts (behind the cog) -->
    <div
      v-if="picking"
      class="scroll-hide scroll-fade-x -mt-1 mb-4 flex gap-1.5 overflow-x-auto sm:scroll-fade-none sm:flex-wrap"
      role="group"
      aria-label="Figures"
    >
      <FilterChip
        v-for="key in FIGURE_KEYS"
        :key="key"
        :pressed="picked.includes(key)"
        :title="picked.includes(key) && picked.length === 1 ? 'At least one' : undefined"
        @toggle="toggleFigure(key)"
        >{{ FIGURES[key].title }}</FilterChip
      >
    </div>

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

    <p v-else-if="!shown" class="py-6 text-center text-text-secondary">No data</p>

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
        <TimelineChart
          :series="chart.series"
          :label="chart.lineLabel"
          :height="220"
          fill
          stepped
          :y-axis-width="yAxisWidth(chart.key)"
          :pad-right="PAD_RIGHT"
          @y-axis-fit="(width) => fitAxis(`${chart.key}-line`, width)"
        />

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
          :domain="chart.domain"
          :y-axis-width="yAxisWidth(chart.key)"
          :pad-right="PAD_RIGHT"
          @y-axis-fit="(width) => fitAxis(`${chart.key}-bars`, width)"
        />
      </section>
    </div>
  </UiPanel>
</template>
