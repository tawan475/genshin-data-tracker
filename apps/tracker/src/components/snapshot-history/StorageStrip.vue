<script setup lang="ts">
import { computed } from 'vue'

/** The old Import History "Storage" card, fed by the account's counters. */
const props = defineProps<{
  snapshots: number
  rawBytes: number
  storedBytes: number
  loading?: boolean
}>()

/** The old dashboard's formatBytes (two decimals, trailing zeros dropped). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

const saved = computed(() =>
  props.rawBytes > 0 ? ((1 - props.storedBytes / props.rawBytes) * 100).toFixed(1) : 0,
)
</script>

<template>
  <!-- Storage Stats Loading Skeleton -->
  <div
    v-if="loading"
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 relative z-10 transition-colors animate-pulse"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
      <div class="flex flex-wrap items-center gap-6">
        <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
    </div>
  </div>

  <!-- Storage Stats -->
  <div
    v-else
    class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 relative z-10 transition-colors"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h3 class="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        Storage
      </h3>
      <div
        class="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-6"
      >
        <div class="flex items-center gap-2">
          <span class="text-slate-500 dark:text-slate-400">Snapshots:</span>
          <span class="font-semibold text-slate-900 dark:text-slate-100">{{ snapshots }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-slate-500 dark:text-slate-400">Raw Data:</span>
          <span class="font-semibold text-slate-900 dark:text-slate-100">{{
            formatBytes(rawBytes)
          }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-slate-500 dark:text-slate-400">Stored:</span>
          <span class="font-semibold text-emerald-700 dark:text-emerald-400">{{
            formatBytes(storedBytes)
          }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-slate-500 dark:text-slate-400">Saved:</span>
          <span class="font-semibold text-emerald-700 dark:text-emerald-400">{{ saved }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
