<script setup lang="ts">
import { computed } from 'vue'
import { Coins, Pin, PinOff } from 'lucide-vue-next'
import { RARITY_SOFT } from '@/components/characters/tokens'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { MAX_SERIES } from '@/components/materials/use-materials-graph'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatRangeEdge, formatWindow, type ChartRange } from '@/data/chart-range'
import type { MaterialsHistory } from '@/data/materials'
import { clock24, formatCompact, formatDate, formatNumber } from '@/lib/format'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import type { MaterialItem } from './material-items'
import { tabDisplay } from './bag-tabs'
import {
  chartPoints,
  countAt,
  firstSeen,
  flowBetween,
  frameStart,
  PERIOD_OPTIONS,
  rangeFrame,
  referenceFor,
} from './material-stats'

/** One material: count, recent changes, history chart, and what came in and went out. */
const props = defineProps<{
  item: MaterialItem | null
  history: MaterialsHistory
  icon: (key: string) => string
  tracked: boolean
  /** Room for one more tracked material. */
  canTrack: boolean
}>()
const emit = defineEmits<{ close: []; toggleTrack: [key: string] }>()
const range = defineModel<ChartRange>('range', { required: true })

const last = computed(() => props.history.times.length - 1)
const series = computed(() => (props.item ? props.history.series.get(props.item.key) : undefined))

/** Change against the previous snapshot, ~7 and ~30 days back. */
const recent = computed(() =>
  PERIOD_OPTIONS.map((option) => {
    const reference = referenceFor(props.history, option.value)
    return {
      label: option.label,
      change: reference
        ? countAt(series.value, last.value) - countAt(series.value, reference.index)
        : null,
      hint: reference ? `since ${formatDate(reference.takenAt)}` : 'One snapshot only',
    }
  }),
)

const frame = computed(() => rangeFrame(props.history, range.value))
const chart = computed<TimelineSeries[]>(() =>
  props.item
    ? [
        {
          label: props.item.name,
          color: 1,
          points: chartPoints(props.history, props.item.key, frame.value),
        },
      ]
    : [],
)
const rangeStart = computed(() => frameStart(props.history, frame.value))
/** "since Oct 5, 2026, 2:10 PM" (the date alone over a week). */
const sinceStart = computed(
  () =>
    `since ${formatRangeEdge(rangeStart.value, frame.value.end - rangeStart.value, !clock24())}`,
)
const rangeDetail = computed(() => formatWindow(rangeStart.value, frame.value.end, !clock24()))

const stats = computed(() => {
  const item = props.item
  if (!item) return []
  const flow = flowBetween(series.value, frame.value.baseline, last.value)
  const since = firstSeen(props.history, item.key)
  const inRange = sinceStart.value
  const signed = (value: number, sign: string, format: (n: number) => string) =>
    value ? `${sign}${format(value)}` : '0'
  return [
    {
      label: 'Gained',
      value: signed(flow.gained, '+', formatCompact),
      title: `${signed(flow.gained, '+', formatNumber)} ${inRange}`,
      tone: flow.gained ? 'text-success-text' : '',
    },
    {
      label: 'Spent',
      value: signed(flow.spent, '−', formatCompact),
      title: `${signed(flow.spent, '−', formatNumber)} ${inRange}`,
      tone: flow.spent ? 'text-danger-text' : '',
    },
    {
      label: 'Peak',
      value: formatCompact(flow.peak),
      title: `${formatNumber(flow.peak)} ${inRange}`,
      tone: '',
    },
    {
      label: 'First',
      value: since === null ? '—' : formatDate(since),
      title: 'First snapshot holding it',
      tone: '',
    },
  ]
})

/** Where it sits: its in-game Inventory tab; currencies the Inventory doesn't show, the wallet. */
const place = computed(() => {
  const item = props.item
  if (!item) return undefined
  if (item.wallet && item.tab === 'other') {
    return { label: 'Wallet', title: 'Currencies and wish items', icon: Coins }
  }
  const tab = tabDisplay(item.tab)
  return { label: tab.name, title: tab.title, icon: tab.icon }
})
</script>

<template>
  <UiModal :open="item !== null" :title="item?.name ?? ''" size="wide" @close="emit('close')">
    <div v-if="item" class="flex flex-col gap-5">
      <div class="flex items-center gap-3 sm:gap-4">
        <span
          class="size-14 shrink-0 rounded-xl p-1 text-xl sm:size-16"
          :class="RARITY_SOFT[item.rarity ?? 0] ?? 'bg-surface-overlay'"
        >
          <MaterialIcon :src="icon(item.key)" :name="item.name" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col">
          <span
            class="tabular truncate font-mono text-2xl leading-tight font-semibold sm:text-3xl"
            >{{ formatNumber(item.count) }}</span
          >
          <span
            v-if="place"
            class="inline-flex min-w-0 items-center gap-1.5 text-sm text-text-muted"
            :title="place.title"
          >
            <component :is="place.icon" class="size-4 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ place.label }}</span>
          </span>
        </div>
        <UiButton
          :variant="tracked ? 'secondary' : 'primary'"
          :disabled="!tracked && !canTrack"
          :title="!tracked && !canTrack ? `Up to ${MAX_SERIES}` : tracked ? 'Untrack' : 'Track'"
          class="shrink-0"
          @click="emit('toggleTrack', item.key)"
        >
          <component :is="tracked ? PinOff : Pin" class="size-4" aria-hidden="true" />
          <span class="sr-only sm:not-sr-only">{{ tracked ? 'Untrack' : 'Track' }}</span>
        </UiButton>
      </div>

      <dl class="grid grid-cols-3 gap-2">
        <div
          v-for="entry in recent"
          :key="entry.label"
          class="flex flex-col rounded-lg bg-surface-overlay/60 px-3 py-2"
        >
          <dt class="text-xs text-text-muted">{{ entry.label }}</dt>
          <dd class="text-lg font-semibold">
            <DeltaText :value="entry.change" :hint="entry.hint" dash />
          </dd>
        </div>
      </dl>

      <section class="flex flex-col gap-3" aria-label="History">
        <div class="flex justify-end">
          <ChartRangeSelect v-model="range" :detail="rangeDetail" />
        </div>
        <TimelineChart
          :series="chart"
          :label="`${item.name} over time, ${sinceStart}`"
          :height="220"
          stepped
          fill
        />
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="stat in stats"
            :key="stat.label"
            class="flex flex-col rounded-lg border border-border-default px-3 py-2"
            :title="stat.title"
          >
            <dt class="text-xs text-text-muted">{{ stat.label }}</dt>
            <dd class="tabular truncate font-mono font-semibold" :class="stat.tone">
              {{ stat.value }}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </UiModal>
</template>
