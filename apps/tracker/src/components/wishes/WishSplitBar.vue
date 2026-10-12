<script setup lang="ts">
import { formatNumber } from '@/lib/format'

/**
 * Two counts as one bar: "5★ 50/50 · 86 won · 68 lost 55.8%" over a bar of
 * the two shares. The colours are token classes for the text and the bar.
 */
defineProps<{
  label: string
  left: { count: number; label: string; text: string; bar: string }
  right: { count: number; label: string; text: string; bar: string }
  /** Shown last, e.g. the won share. */
  rate?: string
  /** A line under the bar (streaks, rate-ups). */
  note?: string
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col justify-center gap-1.5">
    <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
      <span class="text-text-secondary">{{ label }}</span>
      <span class="tabular ml-auto font-mono font-semibold" :class="left.text"
        >{{ formatNumber(left.count) }} {{ left.label }}</span
      >
      <span class="text-text-muted" aria-hidden="true">·</span>
      <span class="tabular font-mono font-semibold" :class="right.text"
        >{{ formatNumber(right.count) }} {{ right.label }}</span
      >
      <span v-if="rate" class="tabular font-mono font-semibold">{{ rate }}</span>
    </div>
    <div class="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
      <div
        :class="left.bar"
        :style="{ width: `${(left.count / Math.max(1, left.count + right.count)) * 100}%` }"
      />
      <div
        :class="right.bar"
        :style="{ width: `${(right.count / Math.max(1, left.count + right.count)) * 100}%` }"
      />
    </div>
    <span v-if="note" class="tabular truncate font-mono text-xs text-text-muted">{{ note }}</span>
  </div>
</template>
