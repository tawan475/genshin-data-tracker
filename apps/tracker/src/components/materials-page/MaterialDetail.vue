<script setup lang="ts">
import { computed } from 'vue'
import { Pin, PinOff } from 'lucide-vue-next'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { MAX_SERIES, RANGE_OPTIONS } from '@/components/materials/use-materials-graph'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import type { MaterialsHistory } from '@/data/materials'
import { formatCompact, formatDate, formatNumber } from '@/lib/format'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import type { MaterialItem } from './material-items'
import { KIND_BY_ID, WALLET_KIND } from './material-meta'
import {
  chartPoints,
  countAt,
  firstSeen,
  flowBetween,
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
const range = defineModel<number>('range', { required: true })

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
const rangeStart = computed(() => {
  const f = frame.value
  return f.carryIn >= 0 ? f.from : (props.history.times[f.baseline] ?? 0)
})

const stats = computed(() => {
  const item = props.item
  if (!item) return []
  const flow = flowBetween(series.value, frame.value.baseline, last.value)
  const since = firstSeen(props.history, item.key)
  const inRange = `since ${formatDate(rangeStart.value)}`
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

const kind = computed(() => {
  const item = props.item
  if (!item) return undefined
  return item.wallet ? WALLET_KIND : KIND_BY_ID.get(item.kind)
})
</script>

<template>
  <UiModal :open="item !== null" :title="item?.name ?? ''" wide @close="emit('close')">
    <div v-if="item" class="flex flex-col gap-5">
      <div class="flex items-center gap-3 sm:gap-4">
        <span class="size-14 shrink-0 rounded-xl bg-surface-overlay p-1 text-xl sm:size-16">
          <MaterialIcon :src="icon(item.key)" :name="item.name" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col">
          <span
            class="tabular truncate font-mono text-2xl leading-tight font-semibold sm:text-3xl"
            >{{ formatNumber(item.count) }}</span
          >
          <span
            v-if="kind"
            class="inline-flex items-center gap-1.5 text-sm text-text-muted"
            :title="kind.detail"
          >
            <component :is="kind.icon" class="size-4" aria-hidden="true" />
            {{ kind.label }}
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
          <UiSegmented v-model="range" :options="RANGE_OPTIONS" label="Chart range" />
        </div>
        <TimelineChart
          :series="chart"
          :label="`${item.name} over time, since ${formatDate(rangeStart)}`"
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
