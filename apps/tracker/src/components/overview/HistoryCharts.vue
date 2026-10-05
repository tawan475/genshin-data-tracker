<script setup lang="ts">
import { computed } from 'vue'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { useChartRange } from '@/components/charts/use-chart-range'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatWindow } from '@/data/chart-range'
import { clock24, formatNumber } from '@/lib/format'
import {
  historyWindow,
  rangeFigure,
  stepSeries,
  type Capture,
  type RangeFigure,
  type SummaryKey,
} from '@/data/overview'
import ChangeValue from './ChangeValue.vue'

/**
 * Mora, primogems, artifacts and unlocked 4★/3★ artifacts over time, one
 * chart per scale. One range control above all four filters every chart the
 * same way. Every capture is drawn (repeats dropped), so an hour range shows
 * each capture in it, with the value held when the range opens carried in.
 */
const props = defineProps<{ captures: Capture[] }>()

interface ChartDef {
  id: string
  title: string
  /** Tooltip on the title. */
  detail?: string
  series: { key: SummaryKey; label: string; color: TimelineSeries['color'] }[]
}

// The 4★/3★ series use chart-6 (violet) and chart-3 (green): a pair that stays
// apart under colour-vision deficiency in both themes; violet/sky does not.
const CHARTS: ChartDef[] = [
  { id: 'mora', title: 'Mora', series: [{ key: 'mora', label: 'Mora', color: 2 }] },
  {
    id: 'primogem',
    title: 'Primogems',
    series: [{ key: 'primogem', label: 'Primogems', color: 4 }],
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    series: [{ key: 'artifacts', label: 'Artifacts', color: 5 }],
  },
  {
    id: 'low-rarity',
    title: '4★ / 3★ Artifact',
    detail: 'Unlocked, unequipped artifacts',
    series: [
      { key: 'artifact4', label: '4★ Artifact', color: 6 },
      { key: 'artifact3', label: '3★ Artifact', color: 3 },
    ],
  },
]

/** Legend swatches, as static classes so Tailwind sees them. */
const SWATCH: Record<TimelineSeries['color'], string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
}

const range = useChartRange('overview-range')

const view = computed(() => historyWindow(props.captures, range.value))

/** "182 captures, Jun 20, 2026 – Jul 13, 2026": the range tooltip and the charts' accessible names. */
const span = computed(() => {
  const { count, from, to } = view.value
  if (!count) return 'no captures'
  const captures = `${formatNumber(count)} ${count === 1 ? 'capture' : 'captures'}`
  return `${captures}, ${formatWindow(from, to, !clock24())}`
})

interface ChartView {
  id: string
  title: string
  detail?: string
  ariaLabel: string
  series: TimelineSeries[]
  figures: { label: string; swatch: string; figure: RangeFigure | null; value: string }[]
}

// Computed once per data version and range; the template only reads.
const charts = computed<ChartView[]>(() => {
  const list = view.value.captures
  return CHARTS.map((def) => {
    const figures = def.series.map((s) => {
      const figure = rangeFigure(list, s.key)
      return {
        label: s.label,
        swatch: SWATCH[s.color],
        figure,
        value: figure ? formatNumber(figure.last) : '—',
      }
    })
    const latest = figures.map((f) => `${f.label} ${f.value}`).join(', ')
    return {
      id: def.id,
      title: def.title,
      detail: def.detail,
      ariaLabel: `${def.title} over time, ${span.value}. Latest: ${latest}.`,
      series: def.series.map((s) => ({
        label: s.label,
        color: s.color,
        points: stepSeries(list, s.key),
      })),
      figures,
    }
  })
})
</script>

<template>
  <UiPanel title="History">
    <template #actions>
      <ChartRangeSelect v-model="range" :detail="span" />
    </template>

    <div class="grid gap-8 lg:grid-cols-2">
      <section
        v-for="chart in charts"
        :key="chart.id"
        class="min-w-0"
        :aria-labelledby="`history-${chart.id}`"
      >
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3
            :id="`history-${chart.id}`"
            class="font-display text-lg font-bold"
            :title="chart.detail"
          >
            {{ chart.title }}
          </h3>
          <dl class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div v-for="item in chart.figures" :key="item.label" class="flex items-baseline gap-2">
              <dt
                :class="
                  chart.figures.length > 1
                    ? 'flex items-center gap-1.5 text-sm text-text-secondary'
                    : 'sr-only'
                "
              >
                <span
                  v-if="chart.figures.length > 1"
                  class="inline-block h-0.5 w-4 rounded-full"
                  :class="item.swatch"
                  aria-hidden="true"
                />
                {{ item.label }}
              </dt>
              <dd class="flex items-baseline gap-2">
                <span class="tabular font-mono font-medium">{{ item.value }}</span>
                <ChangeValue
                  v-if="item.figure"
                  :value="item.figure.change"
                  hint="in this range"
                  class="text-sm"
                />
              </dd>
            </div>
          </dl>
        </div>
        <TimelineChart
          :series="chart.series"
          :label="chart.ariaLabel"
          :height="220"
          :fill="chart.series.length === 1"
          stepped
        />
      </section>
    </div>
  </UiPanel>
</template>
