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
import { CHART_FONT as FONT } from '@/lib/chart-defaults'
import { formatNumber } from '@/lib/format'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export interface BarSeries {
  label: string
  values: number[]
  /** A CSS colour token (`--rarity-5`), or one per bar. */
  color: string | string[]
}

/**
 * Stacked columns, one per label: pulls per month by rarity, 5★ per pity.
 * Colours are theme tokens, re-read when the theme flips; tooltips list
 * each series and `footer` lines.
 */
const props = withDefaults(
  defineProps<{
    labels: string[]
    series: BarSeries[]
    /** Accessible name. */
    label: string
    height?: number
    /** Tooltip title per column (default: the label). */
    titles?: string[]
    footer?: (index: number) => string[]
  }>(),
  { height: 180, titles: undefined, footer: undefined },
)

const canvas = ref<HTMLCanvasElement>()
const chart = shallowRef<Chart<'bar', number[]>>()

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function config(): ChartConfiguration<'bar', number[]> {
  const grid = token('--chart-grid')
  const muted = token('--text-muted')
  const colour = (c: string | string[]) => (Array.isArray(c) ? c.map(token) : token(c))
  return {
    type: 'bar',
    data: {
      labels: props.labels,
      datasets: props.series.map((s) => ({
        label: s.label,
        data: s.values,
        backgroundColor: colour(s.color),
        hoverBackgroundColor: colour(s.color),
        borderRadius: 2,
        maxBarThickness: 28,
        barPercentage: 0.85,
        categoryPercentage: 1,
        stack: 'one',
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { color: grid },
          ticks: { color: muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: muted, maxTicksLimit: 5, precision: 0 },
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
          boxPadding: 4,
          filter: (item) => Number(item.parsed.y) > 0,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? -1
              return props.titles?.[i] ?? props.labels[i] ?? ''
            },
            label: (item) => ` ${item.dataset.label}: ${formatNumber(Number(item.parsed.y))}`,
            footer: (items) => props.footer?.(items[0]?.dataIndex ?? -1) ?? [],
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
watch(() => [props.labels, props.series], render)
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
