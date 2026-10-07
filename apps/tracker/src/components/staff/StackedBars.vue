<script setup lang="ts">
import type { DayCount } from '@gdt/shared'
import { computed } from 'vue'
import { formatMonthDay, formatNumber } from '@/lib/format'

/**
 * Days as thin stacked bars (oldest left), one colour per series in a fixed
 * order with a legend; each bar's tooltip says the day and every figure.
 * A table of the same numbers is there for screen readers.
 */
const props = defineProps<{
  days: DayCount[]
  series: { key: string; label: string; color: string }[]
  label: string
}>()

const HEIGHT = 150

const totals = computed(() =>
  props.days.map((day) => props.series.reduce((sum, s) => sum + Number(day[s.key] ?? 0), 0)),
)
const max = computed(() => Math.max(1, ...totals.value))

const dayMs = (day: string) => Date.parse(`${day}T12:00:00Z`)

const bars = computed(() =>
  props.days.map((day, i) => ({
    day: day.day,
    title: `${formatMonthDay(dayMs(day.day))}: ${props.series
      .map((s) => `${s.label} ${formatNumber(Number(day[s.key] ?? 0))}`)
      .join(' · ')}`,
    // Bottom first (the first series sits on the baseline).
    segments: props.series
      .map((s) => ({
        key: s.key,
        color: s.color,
        height: (Number(day[s.key] ?? 0) / max.value) * HEIGHT,
      }))
      .filter((segment) => segment.height > 0),
    empty: totals.value[i] === 0,
  })),
)

const ticks = computed(() => {
  const days = props.days
  if (days.length === 0) return []
  const pick = [0, Math.floor((days.length - 1) / 2), days.length - 1]
  return pick.map((i) => formatMonthDay(dayMs(days[i]!.day)))
})
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
      <span v-for="s in series" :key="s.key" class="inline-flex items-center gap-1.5">
        <span
          class="size-2.5 rounded-sm"
          :style="{ backgroundColor: s.color }"
          aria-hidden="true"
        />
        {{ s.label }}
      </span>
    </div>
    <div
      class="flex items-end gap-[3px] border-b border-border-default"
      :style="{ height: `${HEIGHT}px` }"
      role="img"
      :aria-label="label"
    >
      <div
        v-for="bar in bars"
        :key="bar.day"
        class="group flex h-full min-w-0 flex-1 flex-col-reverse justify-start gap-0.5 rounded-t-sm hover:bg-surface-overlay/60"
        :title="bar.title"
      >
        <span
          v-for="(segment, i) in bar.segments"
          :key="segment.key"
          class="block w-full"
          :class="i === bar.segments.length - 1 ? 'rounded-t-[3px]' : ''"
          :style="{
            height: `${Math.max(2, segment.height - 2)}px`,
            backgroundColor: segment.color,
          }"
        />
      </div>
    </div>
    <div class="tabular mt-1.5 flex justify-between font-mono text-xs text-text-muted">
      <span v-for="tick in ticks" :key="tick">{{ tick }}</span>
    </div>
    <!-- A table is never narrower than its cells: hidden by its wrapper. -->
    <div class="sr-only">
      <table>
        <caption>
          {{
            label
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th v-for="s in series" :key="s.key" scope="col">{{ s.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in days" :key="day.day">
            <th scope="row">{{ day.day }}</th>
            <td v-for="s in series" :key="s.key">{{ day[s.key] ?? 0 }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
