<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import { Line } from 'vue-chartjs'
import '@/lib/charts'

/** One of the original overview's chart cards: title, a coloured badge with the latest value, a line chart. */
defineProps<{
  title: string
  badge: string | number
  /** Background and text colours of the badge. */
  badgeClass: string
  data: ChartData<'line'>
  options: ChartOptions<'line'>
}>()
</script>

<template>
  <div
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors"
  >
    <h3
      class="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 flex items-center justify-between"
    >
      {{ title }}
      <span class="text-xs px-2 py-1 rounded font-bold" :class="badgeClass">
        {{ badge }}
      </span>
    </h3>
    <div class="h-48">
      <Line :data="data" :options="options" />
    </div>
  </div>
</template>
