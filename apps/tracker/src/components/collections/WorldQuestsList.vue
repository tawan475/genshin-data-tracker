<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GiCollections } from '@gdt/shared'
import EntryGrid, { type GridEntry } from './EntryGrid.vue'
import HaveFilter, { type HaveFilterValue } from './HaveFilter.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { CheckCheck, Info, SearchX } from 'lucide-vue-next'
import type { CollectionCatalog } from '@/data/collection-names'
import { worldQuestList, type WorldQuest } from '@/data/world-quests'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { t } from '@/i18n'

/**
 * World Quests by region, from the game data's list (the wiki's): done when
 * the capture's parent quests have any of the quest's MainQuest ids finished.
 * Without a capture that sends them (Capture 1.16) the list shows unmarked.
 */
const props = defineProps<{
  catalog: CollectionCatalog
  quests: GiCollections['quests'] | null
}>()
const filter = defineModel<HaveFilterValue>('filter', { required: true })

const REGION_KEY = 'collections:world-quests-region'
const stored = Number(readStorage(REGION_KEY) ?? 'NaN')
const region = ref<number | null>(Number.isInteger(stored) ? stored : null)
watch(region, (value) => writeStorage(REGION_KEY, value === null ? null : String(value)))

const all = computed(() => worldQuestList(props.catalog, props.quests))
const regions = computed(() => {
  const by = new Map<number, WorldQuest[]>()
  for (const quest of all.value) by.set(quest.city, [...(by.get(quest.city) ?? []), quest])
  return [...by.entries()].map(([city, list]) => ({
    city,
    label: list[0]!.region,
    have: list.filter((q) => q.done).length,
    total: list.length,
  }))
})
// A region a later data version dropped falls back to all.
const inRegion = computed(() =>
  region.value === null || !regions.value.some((r) => r.city === region.value)
    ? all.value
    : all.value.filter((q) => q.city === region.value),
)
const have = computed(() => inRegion.value.filter((q) => q.done).length)
const shown = computed<GridEntry[]>(() =>
  inRegion.value
    .filter((q) => !props.quests || filter.value === 'all' || q.done === (filter.value === 'have'))
    .map((q) => {
      const note = q.active ? t('collections.archive.inProgress') : q.series || undefined
      return {
        id: q.id,
        name: q.name,
        note,
        missing: !!props.quests && !q.done,
        title: [
          q.name,
          q.series,
          region.value === null ? q.region : '',
          q.href ? t('collections.guide') : '',
        ]
          .filter(Boolean)
          .join(' · '),
        href: q.href,
      }
    }),
)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      class="scroll-hide scroll-fade-x -mx-3 flex min-w-0 items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:scroll-fade-none"
      role="radiogroup"
      :aria-label="$t('collections.archive.region')"
    >
      <FilterChip radio :pressed="region === null" @toggle="region = null">
        {{ $t('collections.spincrystals.filters.all') }}
      </FilterChip>
      <FilterChip
        v-for="r in regions"
        :key="r.city"
        radio
        :pressed="region === r.city"
        @toggle="region = r.city"
      >
        {{ r.label }}
        <span
          v-if="quests"
          class="tabular font-mono"
          :class="r.have >= r.total ? 'text-success-text' : 'text-text-muted'"
          >{{ formatNumber(r.have) }}/{{ formatNumber(r.total) }}</span
        >
        <span v-else class="tabular font-mono text-text-muted">{{ formatNumber(r.total) }}</span>
      </FilterChip>
    </div>
    <HaveFilter
      v-if="quests"
      v-model="filter"
      :have="have"
      :total="inRegion.length"
      :label="$t('collections.archive.show')"
    />
    <p v-else class="flex items-center gap-1.5 text-sm text-text-muted">
      <Info class="size-4 shrink-0" aria-hidden="true" />
      {{ $t('collections.archive.needCapture') }}
    </p>
    <EntryGrid
      v-if="shown.length > 0"
      :entries="shown"
      :label="$t('collections.archive.tabs.worldQuests')"
    />
    <UiEmpty v-else-if="filter === 'missing'" :title="$t('collections.spincrystals.allCollected')">
      <template #icon><CheckCheck class="text-success-text" aria-hidden="true" /></template>
    </UiEmpty>
    <UiEmpty v-else :title="$t('collections.archive.none')">
      <template #icon><SearchX aria-hidden="true" /></template>
    </UiEmpty>
  </div>
</template>
