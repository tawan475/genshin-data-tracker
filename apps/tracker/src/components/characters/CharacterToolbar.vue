<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import {
  BUILD_OPTIONS,
  CHARACTER_SORTS,
  ELEMENTS,
  ELEMENT_LABELS,
  TALENT_OPTIONS,
  WEAPON_TYPES,
  WEAPON_TYPE_LABELS,
  type CharacterFilters,
  type CharacterSort,
  type Element,
  type SortDirection,
} from '@/data/characters'
import { formatNumber } from '@/lib/format'
import FilterChip from './FilterChip.vue'
import SortControl from './SortControl.vue'
import ViewToggle from './ViewToggle.vue'
import { ELEMENT_FILL } from './tokens'

/**
 * Search, sort, view, and the roster filters. Chip counts are "matches if
 * you pick this", with the other filters applied.
 */
defineProps<{
  elementCounts: ReadonlyMap<Element | null, number>
  rarityCounts: ReadonlyMap<number | null, number>
  /** Matches / roster size, shown while filtering. */
  shown: number
  total: number
  filtered: boolean
}>()
const filters = defineModel<CharacterFilters>('filters', { required: true })
const sort = defineModel<CharacterSort>('sort', { required: true })
const direction = defineModel<SortDirection>('direction', { required: true })
const view = defineModel<'grid' | 'list'>('view', { required: true })
defineEmits<{ clear: [] }>()

const weaponOptions = [
  { value: 'all' as const, label: 'Weapon' },
  ...WEAPON_TYPES.map((w) => ({ value: w, label: WEAPON_TYPE_LABELS[w] })),
]
const RARITIES = [5, 4] as const

function toggleElement(e: Element) {
  filters.value.element = filters.value.element === e ? 'all' : e
}
function toggleRarity(r: 5 | 4) {
  filters.value.rarity = filters.value.rarity === r ? 'all' : r
}
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-sm sm:p-4"
    role="search"
    aria-label="Filter characters"
  >
    <div class="flex flex-wrap items-center gap-2">
      <label class="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
        <span class="sr-only">Search</span>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <UiInput
          v-model="filters.query"
          type="search"
          class="pl-9"
          placeholder="Search"
          title="Name, element, weapon or set"
          autocomplete="off"
        />
      </label>
      <SortControl
        v-model:sort="sort"
        v-model:direction="direction"
        class="min-w-0 flex-1 sm:w-48 sm:flex-none"
        :options="CHARACTER_SORTS"
      />
      <ViewToggle v-model="view" />
    </div>

    <div
      class="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      role="group"
      aria-label="Element and rarity"
    >
      <FilterChip
        v-for="e in ELEMENTS"
        :key="e"
        :pressed="filters.element === e"
        :count="elementCounts.get(e) ?? 0"
        @toggle="toggleElement(e)"
      >
        <span class="size-2.5 rounded-full" :class="ELEMENT_FILL[e]" aria-hidden="true" />
        {{ ELEMENT_LABELS[e] }}
      </FilterChip>
      <span class="my-1 w-px shrink-0 bg-border-default" aria-hidden="true" />
      <FilterChip
        v-for="r in RARITIES"
        :key="r"
        :pressed="filters.rarity === r"
        :count="rarityCounts.get(r) ?? 0"
        @toggle="toggleRarity(r)"
      >
        <span :class="r === 5 ? 'text-rarity-5' : 'text-rarity-4'">{{ r }}★</span>
      </FilterChip>
    </div>

    <div class="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <label class="min-w-0 sm:w-36">
        <span class="sr-only">Weapon type</span>
        <UiSelect v-model="filters.weaponType" :options="weaponOptions" />
      </label>
      <label class="min-w-0 sm:w-40">
        <span class="sr-only">Build</span>
        <UiSelect
          v-model="filters.build"
          :options="BUILD_OPTIONS"
          title="Ready: Lv 90, weapon Lv 90, five maxed artifacts, a full set bonus"
        />
      </label>
      <label class="min-w-0 sm:w-36">
        <span class="sr-only">Talents</span>
        <UiSelect v-model="filters.talents" :options="TALENT_OPTIONS" />
      </label>
      <div
        v-if="filtered"
        class="col-span-3 flex items-center justify-between gap-2 sm:ml-auto sm:justify-end"
      >
        <span class="tabular font-mono text-sm text-text-secondary" aria-live="polite"
          >{{ formatNumber(shown) }} / {{ formatNumber(total) }}</span
        >
        <UiButton variant="ghost" size="sm" @click="$emit('clear')">Clear</UiButton>
      </div>
    </div>
  </div>
</template>
