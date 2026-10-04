<script setup lang="ts">
import { computed } from 'vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

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
    class="relative z-10 rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm transition-colors"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <UiSkeleton class="h-5 w-20" />
      <div class="flex flex-wrap items-center gap-6">
        <UiSkeleton v-for="n in 4" :key="n" class="h-5 w-24" />
      </div>
    </div>
  </div>

  <!-- Storage Stats -->
  <div
    v-else
    class="relative z-10 rounded-xl border border-border-default bg-surface-raised p-4 shadow-sm transition-colors"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h2 class="text-base font-semibold">Storage</h2>
      <div
        class="grid w-full grid-cols-2 gap-x-6 gap-y-2 text-sm sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-6"
      >
        <div class="flex items-center gap-2">
          <span class="text-text-muted">Snapshots</span>
          <span class="tabular font-semibold">{{ snapshots }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-text-muted">Raw Data</span>
          <span class="tabular font-semibold">{{ formatBytes(rawBytes) }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-text-muted">Stored</span>
          <span class="tabular font-semibold text-success-text">{{
            formatBytes(storedBytes)
          }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-text-muted">Saved</span>
          <span class="tabular font-semibold text-success-text">{{ saved }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
