<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCheck, SearchX } from 'lucide-vue-next'
import EntryGrid, { type GridEntry } from './EntryGrid.vue'
import HaveFilter, { type HaveFilterValue } from './HaveFilter.vue'
import NotCaptured from './NotCaptured.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { idLabel, nameOf, type CollectionCatalog } from '@/data/collection-names'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'

/**
 * Furnishing blueprints (Capture 1.7.0's `gi_collections.blueprints`): every
 * blueprint the game data lists, learned or not, with the furnishing's icon.
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog }>()

const learned = computed(() => props.captured.blueprints?.value ?? null)

const KEY = 'collections:blueprints-filter'
const stored = readStorage(KEY) as HaveFilterValue | null
const filter = ref<HaveFilterValue>(stored === 'missing' || stored === 'have' ? stored : 'all')
watch(filter, (value) => writeStorage(KEY, value === 'all' ? null : value))

const entries = computed(() => {
  const owned = new Set(learned.value ?? [])
  const icons = new Map(props.catalog.data.furnishings.map((f) => [f.id, f.icon]))
  const known = props.catalog.data.blueprints.map((b) => ({
    id: b.id,
    name: nameOf(props.catalog, 'blueprints', b.id),
    icon: String(icons.get(b.id) ?? ''),
    have: owned.has(b.id),
  }))
  const knownIds = new Set(known.map((b) => b.id))
  return [
    ...known,
    ...[...owned]
      .filter((id) => !knownIds.has(id))
      .map((id) => ({ id, name: idLabel(id), icon: '', have: true })),
  ]
})
const have = computed(() => entries.value.filter((e) => e.have).length)
const total = computed(() => props.catalog.data.blueprints.length)
const shown = computed<GridEntry[]>(() =>
  entries.value
    .filter((e) => filter.value === 'all' || e.have === (filter.value === 'have'))
    .map((e) => ({ id: e.id, name: e.name, icon: e.icon, missing: !e.have, title: e.name })),
)
</script>

<template>
  <NotCaptured v-if="!learned" :title="$t('collections.tabs.blueprints')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.blueprints.learned')">
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              {{ formatNumber(have)
              }}<span class="text-sm text-text-muted"> / {{ formatNumber(total) }}</span>
            </span>
          </template>
          <UiProgress
            class="mt-1"
            :value="have"
            :max="total"
            :label="$t('collections.blueprints.learned')"
          />
        </UiStat>
      </li>
    </ul>

    <UiPanel :title="$t('collections.tabs.blueprints')" flush>
      <div class="flex flex-col gap-3 p-3 sm:p-5">
        <HaveFilter
          v-model="filter"
          :have="have"
          :total="total"
          :label="$t('collections.archive.show')"
        />
        <EntryGrid
          v-if="shown.length > 0"
          :entries="shown"
          :label="$t('collections.tabs.blueprints')"
        />
        <UiEmpty
          v-else-if="filter === 'missing'"
          :title="$t('collections.spincrystals.allCollected')"
        >
          <template #icon><CheckCheck class="text-success-text" aria-hidden="true" /></template>
        </UiEmpty>
        <UiEmpty v-else :title="$t('collections.archive.none')">
          <template #icon><SearchX aria-hidden="true" /></template>
        </UiEmpty>
      </div>
    </UiPanel>
  </div>
</template>
