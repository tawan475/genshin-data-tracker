<script setup lang="ts">
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import ItemArt from '@/components/ui/ItemArt.vue'
import ChartRangeSelect from '@/components/charts/ChartRangeSelect.vue'
import TimelineChart, { type TimelineSeries } from '@/components/charts/TimelineChart.vue'
import { MAX_SERIES } from '@/components/materials/use-materials-graph'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { formatRangeEdge, formatWindow, type ChartRange } from '@/data/chart-range'
import type { ChartFrame, MaterialsHistory } from '@/data/materials'
import { clock24, formatNumber } from '@/lib/format'
import { materialName, materialRarity } from '@/utils/materials'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import { chartPoints, frameChange, frameStart } from './material-stats'

/**
 * Tracked materials as small multiples: one stepped chart each, so Mora and
 * Primogems never squash each other on a shared axis.
 */
const props = defineProps<{
  history: MaterialsHistory
  frame: ChartFrame
  keys: string[]
  ready: boolean
  icon: (key: string) => string
}>()
const emit = defineEmits<{ open: [key: string]; remove: [key: string]; add: [] }>()
const range = defineModel<ChartRange>('range', { required: true })

const from = computed(() => frameStart(props.history, props.frame))
const rangeHint = computed(
  () => `since ${formatRangeEdge(from.value, props.frame.end - from.value, !clock24())}`,
)
const rangeDetail = computed(() => formatWindow(from.value, props.frame.end, !clock24()))

const rows = computed(() =>
  props.keys.map((key, index) => {
    const name = materialName(key)
    const series: TimelineSeries = {
      label: name,
      color: ((index % 6) + 1) as TimelineSeries['color'],
      points: chartPoints(props.history, key, props.frame),
    }
    return {
      key,
      name,
      rarity: materialRarity(key),
      series: [series],
      count: props.history.latest.get(key) ?? 0,
      change: frameChange(props.history, key, props.frame),
    }
  }),
)
</script>

<template>
  <UiPanel>
    <template #header>
      <h2 class="text-base font-semibold">
        Tracked
        <span
          class="tabular ml-1 font-mono text-sm font-normal text-text-muted"
          title="Tracked / max"
          >{{ keys.length }}/{{ MAX_SERIES }}</span
        >
      </h2>
    </template>
    <template #actions>
      <ChartRangeSelect v-model="range" :detail="rangeDetail" />
      <UiButton v-if="keys.length > 0 && keys.length < MAX_SERIES" size="sm" @click="emit('add')">
        <Plus class="size-4" aria-hidden="true" />
        Track
      </UiButton>
    </template>

    <div v-if="!ready" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      <UiSkeleton v-for="n in 2" :key="n" class="h-52" />
    </div>

    <button
      v-else-if="keys.length === 0"
      type="button"
      class="flex min-h-24 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-default text-sm font-medium text-text-muted transition-colors hover:border-accent hover:text-accent-text"
      @click="emit('add')"
    >
      <Plus class="size-5" aria-hidden="true" />
      Track
    </button>

    <ul v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Tracked materials">
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default p-3"
      >
        <div class="flex items-start gap-1">
          <button
            type="button"
            class="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-surface-overlay"
            :title="row.name"
            @click="emit('open', row.key)"
          >
            <span
              class="relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface-overlay p-0.5 text-xs"
            >
              <ItemArt :rarity="row.rarity" small />
              <MaterialIcon :src="icon(row.key)" :name="row.name" />
            </span>
            <span class="flex min-w-0 flex-col">
              <span class="truncate text-sm text-text-secondary">{{ row.name }}</span>
              <span class="flex flex-wrap items-baseline gap-x-2">
                <span class="tabular font-mono text-lg leading-6 font-semibold">{{
                  formatNumber(row.count)
                }}</span>
                <DeltaText :value="row.change" :hint="rangeHint" dash class="text-sm" />
              </span>
            </span>
          </button>
          <button
            type="button"
            class="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            :aria-label="`Untrack ${row.name}`"
            title="Untrack"
            @click="emit('remove', row.key)"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
        <TimelineChart
          :series="row.series"
          :label="`${row.name} over time, ${rangeHint}`"
          :height="132"
          stepped
          fill
        />
      </li>
    </ul>
  </UiPanel>
</template>
