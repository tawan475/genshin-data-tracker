<script setup lang="ts">
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useMutationObserver } from '@vueuse/core'
import { formatSignedExact } from '@/data/overview'
import { CHART_FONT as FONT } from '@/lib/chart-defaults'
import { formatSigned } from '@/lib/format'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export interface ChangeBar {
  /** Axis label. */
  tick: string
  /** Tooltip title. */
  title: string
  value: number
  /** Extra tooltip lines (muted). */
  detail?: string[]
}

/**
 * Change per period as columns from a zero line: gains in green, losses in
 * red (the sign in the tooltip carries the meaning too). Same tokens and
 * tooltip as TimelineChart, re-read when the theme flips.
 */
const props = withDefaults(
  defineProps<{
    bars: ChangeBar[]
    /** Series name in the tooltip ("Mora"). */
    name: string
    /** Accessible name of the chart. */
    label: string
    height?: number
  }>(),
  { height: 150 },
)

const canvas = ref<HTMLCanvasElement>()
const chart = shallowRef<Chart<'bar'>>()

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function config(): ChartConfiguration<'bar'> {
  const bars = props.bars
  const grid = token('--chart-grid')
  const zero = token('--border-strong')
  const muted = token('--text-muted')
  const gain = token('--chart-3')
  const loss = token('--danger')
  return {
    type: 'bar',
    data: {
      labels: bars.map((b) => b.tick),
      datasets: [
        {
          label: props.name,
          data: bars.map((b) => b.value),
          backgroundColor: bars.map((b) => (b.value >= 0 ? gain : loss)),
          hoverBackgroundColor: bars.map((b) => (b.value >= 0 ? gain : loss)),
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 24,
          barPercentage: 0.8,
          categoryPercentage: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          border: { color: grid },
          ticks: {
            color: muted,
            maxTicksLimit: 6,
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 16,
            // Label widths are measured on a sample: hourly ranges have thousands.
            sampleSize: 24,
          },
        },
        y: {
          grid: { color: (ctx) => (ctx.tick?.value === 0 ? zero : grid) },
          border: { display: false },
          ticks: { color: muted, maxTicksLimit: 5, callback: (v) => formatSigned(Number(v)) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: token('--surface-raised'),
          borderColor: token('--border-default'),
          borderWidth: 1,
          titleColor: token('--text-primary'),
          bodyColor: token('--text-secondary'),
          footerColor: muted,
          titleFont: { family: FONT, size: 14, weight: 'bold' },
          bodyFont: { family: FONT, size: 14 },
          footerFont: { family: FONT, size: 13, weight: 'normal' },
          padding: 10,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            title: (items) => bars[items[0]?.dataIndex ?? -1]?.title ?? '',
            label: (item) => ` ${props.name}: ${formatSignedExact(Number(item.parsed.y))}`,
            footer: (items) => bars[items[0]?.dataIndex ?? -1]?.detail ?? [],
          },
        },
      },
    },
  }
}

function render() {
  if (!canvas.value) return
  chart.value?.destroy()
  chart.value = new Chart(canvas.value, config())
}

onMounted(render)
onBeforeUnmount(() => chart.value?.destroy())
watch(() => [props.bars, props.name], render)
// Re-read the tokens when the theme flips.
useMutationObserver(
  () => document.documentElement,
  () => render(),
  { attributes: true, attributeFilter: ['data-theme'] },
)
</script>

<template>
  <div class="relative w-full" :style="{ height: `${height}px` }">
    <canvas ref="canvas" role="img" :aria-label="label" />
  </div>
</template>
