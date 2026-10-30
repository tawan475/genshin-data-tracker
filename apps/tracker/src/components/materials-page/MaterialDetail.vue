<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Coins, Pin, PinOff, X } from 'lucide-vue-next'
import type { MaterialDetail } from '@gdt/game-data/material-details'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { MAX_SERIES } from '@/components/materials/use-materials-graph'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { formatRangeEdge, formatWindow, type ChartRange } from '@/data/chart-range'
import type { MaterialsHistory } from '@/data/materials'
import { t } from '@/i18n'
import { clock24, formatCompact, formatDate, formatNumber } from '@/lib/format'
import { locale } from '@/i18n/locale'
import { loadMaterialDetail } from '@/utils/materials'
import DeltaText from './DeltaText.vue'
import ItemDetailPanel from './ItemDetailPanel.vue'
import type { MaterialItem } from './material-items'
import { tabDisplay } from './bag-tabs'
import {
  chartPoints,
  countAt,
  firstSeen,
  flowBetween,
  frameStart,
  periodOptions,
  rangeFrame,
  referenceFor,
} from './material-stats'

/**
 * One material: the game's item detail panel (header art, type line, stars,
 * description, sources) as the dialog's left side (on top on phones), then
 * its count, recent changes, history chart, and what came in and went out.
 */
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

// The game's text for the open item, in the language on screen (a late answer for another item is dropped).
const detail = ref<MaterialDetail | undefined>()
const detailLoading = ref(false)
watch(
  [() => props.item?.key, locale],
  async ([key, lang]) => {
    detail.value = undefined
    if (!key) return
    detailLoading.value = true
    const found = await loadMaterialDetail(key, lang)
    if (props.item?.key !== key || locale.value !== lang) return
    detail.value = found
    detailLoading.value = false
  },
  { immediate: true },
)

const last = computed(() => props.history.times.length - 1)
const series = computed(() => (props.item ? props.history.series.get(props.item.key) : undefined))

/** Change against the previous snapshot, ~7 and ~30 days back. */
const recent = computed(() =>
  periodOptions().map((option) => {
    const reference = referenceFor(props.history, option.value)
    return {
      label: option.label,
      change: reference
        ? countAt(series.value, last.value) - countAt(series.value, reference.index)
        : null,
      hint: reference
        ? t('materials.since', { date: formatDate(reference.takenAt) })
        : t('materials.oneSnapshot'),
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
const sinceStart = computed(() =>
  t('materials.since', {
    date: formatRangeEdge(rangeStart.value, frame.value.end - rangeStart.value, !clock24()),
  }),
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
  const within = (value: string) => t('materials.detail.statTitle', { value, since: inRange })
  return [
    {
      label: t('materials.detail.gained'),
      value: signed(flow.gained, '+', formatCompact),
      title: within(signed(flow.gained, '+', formatNumber)),
      tone: flow.gained ? 'text-success-text' : '',
    },
    {
      label: t('materials.detail.spent'),
      value: signed(flow.spent, '−', formatCompact),
      title: within(signed(flow.spent, '−', formatNumber)),
      tone: flow.spent ? 'text-danger-text' : '',
    },
    {
      label: t('materials.detail.peak'),
      value: formatCompact(flow.peak),
      title: within(formatNumber(flow.peak)),
      tone: '',
    },
    {
      label: t('materials.detail.first'),
      value: since === null ? '—' : formatDate(since),
      title: t('materials.detail.firstTitle'),
      tone: '',
    },
  ]
})

/** Where it sits: its in-game Inventory tab; currencies the Inventory doesn't show, the wallet. */
const place = computed(() => {
  const item = props.item
  if (!item) return undefined
  if (item.wallet && item.tab === 'other') {
    return { label: t('materials.wallet.label'), title: t('materials.wallet.title'), icon: Coins }
  }
  const tab = tabDisplay(item.tab)
  return { label: tab.name, title: tab.title, icon: tab.icon }
})
</script>

<template>
  <UiModal
    :open="item !== null"
    :title="item?.name ?? ''"
    size="detail"
    bare
    @close="emit('close')"
  >
    <div v-if="item" class="grid lg:grid-cols-[22rem_minmax(0,1fr)]">
      <!-- From lg the right side sets the height; a long description scrolls inside the panel. -->
      <div class="lg:relative">
        <ItemDetailPanel
          class="lg:absolute lg:inset-0"
          :name="item.name"
          :rarity="item.rarity"
          :icon="icon(item.key)"
          :detail="detail"
          :loading="detailLoading"
        >
          <template #close>
            <button
              type="button"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-(--artifact-band-ink) transition-colors hover:bg-black/20 lg:hidden"
              :aria-label="$t('ui.close')"
              :title="$t('ui.close')"
              @click="emit('close')"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </template>
        </ItemDetailPanel>
      </div>

      <div class="flex min-w-0 flex-col gap-5 p-4 sm:p-5 lg:pt-3 lg:pr-3">
        <div class="flex items-center gap-3 sm:gap-4">
          <div class="flex min-w-0 flex-1 flex-col lg:pt-2">
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
            :title="
              !tracked && !canTrack
                ? $t('materials.upTo', { max: MAX_SERIES })
                : tracked
                  ? $t('materials.untrack')
                  : $t('materials.track')
            "
            class="shrink-0"
            @click="emit('toggleTrack', item.key)"
          >
            <component :is="tracked ? PinOff : Pin" class="size-4" aria-hidden="true" />
            <span class="sr-only sm:not-sr-only">{{
              tracked ? $t('materials.untrack') : $t('materials.track')
            }}</span>
          </UiButton>
          <UiIconButton
            :label="$t('ui.close')"
            class="self-start max-lg:hidden"
            @click="emit('close')"
          >
            <X class="size-5" aria-hidden="true" />
          </UiIconButton>
        </div>

        <dl class="grid grid-cols-3 gap-2 lg:mr-2">
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

        <section class="flex flex-col gap-3 lg:mr-2" :aria-label="$t('materials.detail.history')">
          <div class="flex justify-end">
            <ChartRangeSelect v-model="range" :detail="rangeDetail" />
          </div>
          <TimelineChart
            :series="chart"
            :label="$t('materials.detail.chartLabel', { name: item.name, since: sinceStart })"
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
    </div>
  </UiModal>
</template>
