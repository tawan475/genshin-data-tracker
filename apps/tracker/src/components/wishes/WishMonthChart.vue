<script setup lang="ts">
import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'
import type { MonthCount } from '@/data/wish-history'
import { t } from '@/i18n'
import { formatNumber } from '@/lib/format'
import { monthName } from './wish-labels'

/**
 * Pulls per month of every banner, stacked by rarity (3★, 4★, 5★), every
 * month from the first pull on, labelled each January and July. The columns
 * keep a minimum width, so years of history scroll sideways; it opens on
 * the newest month.
 */
const props = defineProps<{ months: MonthCount[] }>()

const peak = computed(() => Math.max(1, ...props.months.map((m) => m.total)))
const pct = (n: number) => `${(n / peak.value) * 100}%`
const labels = computed(() =>
  props.months.map((m) => (m.month.endsWith('-01') || m.month.endsWith('-07') ? m.month : '')),
)
const title = (m: MonthCount) =>
  `${t('wishes.chart.month', { month: monthName(m.month), n: formatNumber(m.total) })}\n` +
  `${formatNumber(m.five)} 5★ · ${formatNumber(m.four)} 4★ · ${formatNumber(m.total - m.five - m.four)} 3★`

const box = useTemplateRef<HTMLElement>('box')
const toNewest = () => void nextTick(() => box.value?.scrollTo({ left: box.value.scrollWidth }))
onMounted(toNewest)
watch(() => props.months.length, toNewest)

const SERIES = [
  { label: '3★', swatch: 'bg-rarity-3' },
  { label: '4★', swatch: 'bg-rarity-4' },
  { label: '5★', swatch: 'bg-rarity-5' },
]
</script>

<template>
  <section
    :aria-label="$t('wishes.chart.title')"
    class="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border-default bg-surface-raised px-4 pt-4 pb-3.5 shadow-sm sm:px-5"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 class="text-base font-semibold">{{ $t('wishes.chart.title') }}</h2>
      <span class="ml-auto inline-flex gap-x-3 text-xs text-text-secondary" aria-hidden="true">
        <span v-for="s in SERIES" :key="s.label" class="inline-flex items-center gap-1.5"
          ><span class="size-2.5 rounded-[3px]" :class="s.swatch" />{{ s.label }}</span
        >
      </span>
    </div>
    <div ref="box" class="overflow-x-auto">
      <div
        class="flex w-full min-w-max flex-col gap-1.5"
        role="img"
        :aria-label="$t('wishes.chart.label', { n: months.length })"
      >
        <div class="flex h-[10.5rem] items-end gap-[3px] border-b border-border-default">
          <div
            v-for="m in months"
            :key="m.month"
            class="flex h-full flex-[1_0_7px] flex-col-reverse gap-px"
            :title="title(m)"
          >
            <div
              v-if="m.total - m.five - m.four"
              class="rounded-[2px] bg-rarity-3"
              :style="{ height: pct(m.total - m.five - m.four) }"
            />
            <div v-if="m.four" class="rounded-[2px] bg-rarity-4" :style="{ height: pct(m.four) }" />
            <div
              v-if="m.five"
              class="rounded-t-[2px] bg-rarity-5"
              :style="{ height: pct(m.five) }"
            />
          </div>
        </div>
        <div class="flex gap-[3px] text-xs text-text-muted" aria-hidden="true">
          <span
            v-for="(label, i) in labels"
            :key="months[i]!.month"
            class="tabular w-0 flex-[1_0_7px] overflow-visible font-mono whitespace-nowrap"
            >{{ label }}</span
          >
        </div>
      </div>
    </div>
  </section>
</template>
