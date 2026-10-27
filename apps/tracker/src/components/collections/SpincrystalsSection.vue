<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCheck, Disc3, Music, SearchX } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiStat from '@/components/ui/UiStat.vue'
import {
  SPINCRYSTAL_ICON,
  filterSpincrystals,
  spincrystalGuide,
  type SpincrystalFilter,
  type SpincrystalProgress,
  type SpincrystalRow,
} from '@/data/spincrystals'
import { gameIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialEnglishName, materialName, materialRarity } from '@/utils/materials'
import { t } from '@/i18n'

/**
 * Radiant Spincrystals: collected / total, then one tile per Spincrystal
 * (its number; the song-named ones by name), All / Missing / Have.
 * `progress` is null while no capture has the list.
 */
const props = defineProps<{ progress: SpincrystalProgress | null }>()

const FILTER_KEY = 'collections:spincrystals'
const FILTERS: SpincrystalFilter[] = ['all', 'missing', 'have']
const stored = readStorage(FILTER_KEY) as SpincrystalFilter | null
const filter = ref<SpincrystalFilter>(stored && FILTERS.includes(stored) ? stored : 'all')
watch(filter, (value) => writeStorage(FILTER_KEY, value === 'all' ? null : value))

const missing = computed(() => (props.progress ? props.progress.total - props.progress.have : 0))
const options = computed<SegmentedOption<SpincrystalFilter>[]>(() => {
  const p = props.progress
  const counts = { all: p?.total, missing: missing.value, have: p?.have }
  return FILTERS.map((value) => ({
    value,
    label: t(`collections.spincrystals.filters.${value}`),
    count: counts[value],
  }))
})

const numbered = computed(() =>
  props.progress ? filterSpincrystals(props.progress.numbered, filter.value) : [],
)
const named = computed(() =>
  props.progress ? filterSpincrystals(props.progress.named, filter.value) : [],
)
const empty = computed(() =>
  props.progress && numbered.value.length + named.value.length === 0 ? filter.value : null,
)

const icon = computed(() => gameIcon(SPINCRYSTAL_ICON))
const title = computed(() => t('collections.spincrystals.title'))

const collectedHint = computed(() => {
  const unknown = props.progress?.unknown.length ?? 0
  const hint = t('collections.spincrystals.collectedHint')
  return unknown
    ? `${hint} · ${t('collections.spincrystals.unknown', { n: formatNumber(unknown) })}`
    : hint
})

const state = (row: SpincrystalRow) =>
  t(`collections.spincrystals.${row.have ? 'stateHave' : 'stateMissing'}`)
const tileTitle = (row: SpincrystalRow) =>
  `${materialName(row.key)} · ${state(row)} · ${t('collections.spincrystals.guide')}`
const guide = (row: SpincrystalRow) => spincrystalGuide(row, materialEnglishName(row.key))
</script>

<template>
  <div class="flex flex-col gap-4 lg:gap-6">
    <ul
      v-if="progress"
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.spincrystals.summary')"
    >
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.spincrystals.collected')" :hint="collectedHint">
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              {{ formatNumber(progress.have)
              }}<span class="text-sm text-text-muted"> / {{ formatNumber(progress.total) }}</span>
            </span>
          </template>
          <UiProgress
            class="mt-1"
            :value="progress.have"
            :max="progress.total"
            :label="$t('collections.spincrystals.collectedLabel')"
          />
        </UiStat>
      </li>
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.spincrystals.missing')"
          :value="missing"
          exact
          :hint="$t('collections.spincrystals.missingHint')"
        />
      </li>
    </ul>

    <UiPanel flush>
      <template #header>
        <div class="flex min-w-0 items-center gap-2.5">
          <GameIcon
            :src="icon"
            :name="title"
            :rarity="materialRarity('RadiantSpincrystal1') ?? 4"
            size="xs"
          />
          <h2 class="truncate text-base font-semibold">{{ title }}</h2>
        </div>
      </template>
      <template v-if="progress" #actions>
        <UiSegmented
          v-model="filter"
          :options="options"
          :label="$t('collections.spincrystals.show')"
        />
      </template>

      <UiEmpty
        v-if="!progress"
        :title="$t('collections.spincrystals.notCaptured')"
        :body="$t('collections.spincrystals.notCapturedBody')"
      >
        <template #icon><Disc3 aria-hidden="true" /></template>
      </UiEmpty>
      <UiEmpty v-else-if="empty === 'missing'" :title="$t('collections.spincrystals.allCollected')">
        <template #icon><CheckCheck class="text-success-text" aria-hidden="true" /></template>
      </UiEmpty>
      <UiEmpty v-else-if="empty" :title="$t('collections.spincrystals.noneCollected')">
        <template #icon><SearchX aria-hidden="true" /></template>
      </UiEmpty>

      <div v-else class="flex flex-col gap-3 p-3 sm:p-5">
        <ul
          v-if="numbered.length > 0"
          class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5"
          :aria-label="title"
        >
          <li v-for="row in numbered" :key="row.id" class="flex min-w-0">
            <a
              :href="guide(row)"
              target="_blank"
              rel="noopener noreferrer"
              class="tabular flex h-9 w-full min-w-0 items-center justify-center rounded-md border font-mono text-sm transition-colors"
              :class="
                row.have
                  ? 'border-accent-text/40 bg-accent/15 font-medium text-accent-text hover:bg-accent/25'
                  : 'border-dashed border-border-strong text-text-muted hover:border-solid hover:text-text-primary'
              "
              :title="tileTitle(row)"
            >
              <span class="sr-only">{{ tileTitle(row) }}</span>
              <span aria-hidden="true">{{ row.number }}</span>
            </a>
          </li>
        </ul>
        <ul
          v-if="named.length > 0"
          class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-1.5"
        >
          <li v-for="row in named" :key="row.id" class="flex min-w-0">
            <a
              :href="guide(row)"
              target="_blank"
              rel="noopener noreferrer"
              class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm leading-snug transition-colors"
              :class="
                row.have
                  ? 'border-accent-text/40 bg-accent/15 font-medium text-accent-text hover:bg-accent/25'
                  : 'border-dashed border-border-strong text-text-muted hover:border-solid hover:text-text-primary'
              "
              :title="tileTitle(row)"
            >
              <Music class="size-3.5 shrink-0" aria-hidden="true" />
              <span class="sr-only">{{ tileTitle(row) }}</span>
              <span class="line-clamp-2 min-w-0 break-words" aria-hidden="true">{{
                materialName(row.key)
              }}</span>
            </a>
          </li>
        </ul>
      </div>
    </UiPanel>
  </div>
</template>
