<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import type { MonthSplit } from '@/data/wish-history'
import { formatNumber } from '@/lib/format'
import { monthName } from './wish-labels'

/**
 * Pulls per month, stacked by banner type (Character Event, Weapon Event,
 * the rest), every month from the first pull on with a year under each
 * January. The columns keep a minimum width, so years of history scroll
 * sideways; it opens on the newest month.
 */
const props = defineProps<{ months: MonthSplit[] }>()

const peak = computed(() => Math.max(1, ...props.months.map((m) => m.total)))
const pct = (n: number) => `${(n / peak.value) * 100}%`

/** A year under each January, and under the first month when its January is out of view. */
const labels = computed(() =>
  props.months.map((m, i) => {
    const [year, month] = m.month.split('-')
    if (month === '01') return year!
    if (i === 0 && Number(month) <= 9) return year!
    return ''
  }),
)

const title = (m: MonthSplit) =>
  `${monthName(m.month)}: ${formatNumber(m.total)} wishes\n` +
  `${formatNumber(m.character)} character · ${formatNumber(m.weapon)} weapon · ${formatNumber(m.other)} other`

const box = useTemplateRef<HTMLElement>('box')
const toNewest = () => void nextTick(() => box.value?.scrollTo({ left: box.value.scrollWidth }))
onMounted(toNewest)
watch(() => props.months.length, toNewest)

const SERIES = [
  { label: 'Character', swatch: 'bg-chart-1' },
  { label: 'Weapon', swatch: 'bg-chart-4' },
  { label: 'Other', swatch: 'bg-chart-3' },
]
</script>

<template>
  <section
    aria-label="Pulls per month"
    class="flex min-w-0 flex-col rounded-xl border border-border-default bg-surface-raised shadow-sm"
  >
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-default px-4 py-3 sm:px-5"
    >
      <h2 class="flex min-h-10 items-center text-base font-semibold">Pulls per month</h2>
      <span class="ml-auto inline-flex flex-wrap gap-x-3.5 text-xs text-text-secondary">
        <span v-for="s in SERIES" :key="s.label" class="inline-flex items-center gap-1.5"
          ><span class="size-2.5 rounded-[3px]" :class="s.swatch" />{{ s.label }}</span
        >
      </span>
    </div>
    <div ref="box" class="overflow-x-auto px-4 pt-4.5 pb-3.5 sm:px-5">
      <div
        class="flex w-full min-w-max flex-col gap-2"
        role="img"
        :aria-label="`Pulls per month, ${months.length} months`"
      >
        <div class="flex h-[11rem] items-end gap-[3px] border-b border-border-default">
          <div
            v-for="m in months"
            :key="m.month"
            class="flex h-full flex-[1_0_8px] flex-col-reverse gap-px"
            :title="title(m)"
          >
            <div
              v-if="m.character"
              class="rounded-[2px] bg-chart-1"
              :style="{ height: pct(m.character) }"
            />
            <div
              v-if="m.weapon"
              class="rounded-[2px] bg-chart-4"
              :style="{ height: pct(m.weapon) }"
            />
            <div
              v-if="m.other"
              class="rounded-t-[2px] bg-chart-3"
              :style="{ height: pct(m.other) }"
            />
          </div>
        </div>
        <div class="flex gap-[3px] text-xs text-text-muted" aria-hidden="true">
          <span
            v-for="(label, i) in labels"
            :key="months[i]!.month"
            class="tabular w-0 flex-[1_0_8px] overflow-visible font-mono whitespace-nowrap"
            >{{ label }}</span
          >
        </div>
      </div>
    </div>
  </section>
</template>
