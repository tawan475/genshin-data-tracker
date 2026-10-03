<script setup lang="ts">
import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useMutationObserver } from '@vueuse/core'
import { formatCompact, formatDate, formatDateTime, formatNumber } from '@/lib/format'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

export interface TimelineSeries {
  label: string
  /** A chart token: 1–6 (see --chart-N in main.css). */
  color: 1 | 2 | 3 | 4 | 5 | 6
  points: { x: number; y: number }[]
}

/**
 * A line chart over time (x in epoch ms). Colours come from the design
 * tokens and are re-read when the theme flips. Series with very different
 * scales belong in separate charts: there is one y axis.
 */
const props = withDefaults(
  defineProps<{
    series: TimelineSeries[]
    label: string
    height?: number
    /** Formats y values (axis and tooltip). Defaults to compact numbers. */
    format?: (value: number) => string
    stepped?: boolean
    fill?: boolean
  }>(),
  { height: 260 },
)

const canvas = ref<HTMLCanvasElement>()
const chart = shallowRef<Chart<'line'>>()

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function config(): ChartConfiguration<'line'> {
  const format = props.format ?? formatCompact
  const grid = token('--chart-grid')
  const muted = token('--text-muted')
  const xs = props.series.flatMap((s) => s.points.map((p) => p.x))
  const span = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
  return {
    type: 'line',
    data: {
      datasets: props.series.map((s) => {
        const color = token(`--chart-${s.color}`)
        return {
          label: s.label,
          data: s.points,
          borderColor: color,
          backgroundColor: `${color}22`,
          fill: props.fill ?? props.series.length === 1,
          stepped: props.stepped ? 'before' : false,
          borderWidth: 2,
          pointRadius: s.points.length > 60 ? 0 : 2,
          pointHoverRadius: 4,
          tension: 0,
        }
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear',
          grid: { color: grid },
          border: { color: grid },
          ticks: {
            color: muted,
            maxTicksLimit: 6,
            maxRotation: 0,
            callback: (value) => formatDate(Number(value)),
          },
          // Under two days, label ticks with times rather than repeating the date.
          ...(span < 2 * 86400_000 ? { ticks: { color: muted, maxTicksLimit: 6, callback: (v) => formatDateTime(Number(v)) } } : {}),
        },
        y: {
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, callback: (value) => format(Number(value)) },
        },
      },
      plugins: {
        tooltip: {
          backgroundColor: token('--surface-raised'),
          borderColor: token('--border-default'),
          borderWidth: 1,
          titleColor: token('--text-primary'),
          bodyColor: token('--text-secondary'),
          titleFont: { family: 'Instrument Sans', size: 14 },
          bodyFont: { family: 'JetBrains Mono', size: 14 },
          padding: 10,
          callbacks: {
            title: (items) => (items[0] ? formatDateTime(Number(items[0].parsed.x)) : ''),
            label: (item) => ` ${item.dataset.label}: ${formatNumber(Number(item.parsed.y))}`,
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
watch(() => [props.series, props.stepped, props.fill], render, { deep: true })
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
