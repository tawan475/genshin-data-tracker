<script setup lang="ts">
import { ArrowUp, LayoutGrid, List, Search } from 'lucide-vue-next'
import SortControl from '@/components/characters/SortControl.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import {
  LEVEL_OPTIONS,
  WEAPON_SORTS,
  WEAPON_TYPES,
  WEAPON_TYPE_LABELS,
  type RarityFilter,
  type SortDirection,
  type WeaponFilters,
  type WeaponSort,
  type WeaponType,
} from '@/data/weapons'
import { formatNumber } from '@/lib/format'

/**
 * Search, sort, view and the armory filters. Chip counts are copies that
 * would match if you picked the chip, with the other filters applied.
 */
defineProps<{
  typeCounts: ReadonlyMap<WeaponType | null, number>
  rarityCounts: ReadonlyMap<RarityFilter | null, number>
  refinableCount: number
  /** Matching copies / all copies, shown while filtering. */
  shown: number
  total: number
  filtered: boolean
}>()
const filters = defineModel<WeaponFilters>('filters', { required: true })
const sort = defineModel<WeaponSort>('sort', { required: true })
const direction = defineModel<SortDirection>('direction', { required: true })
const view = defineModel<'grid' | 'list'>('view', { required: true })
defineEmits<{ clear: [] }>()

const RARITIES: { value: Exclude<RarityFilter, 'all'>; label: string; tone: string }[] = [
  { value: 5, label: '5★', tone: 'text-rarity-5' },
  { value: 4, label: '4★', tone: 'text-rarity-4' },
  { value: 3, label: '3★', tone: 'text-rarity-3' },
  { value: 'low', label: '1–2★', tone: 'text-rarity-2' },
]
const VIEWS: SegmentedOption<'grid' | 'list'>[] = [
  { value: 'grid', label: 'Cards', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: List },
]
const statusOptions = [
  { value: 'all' as const, label: 'Status' },
  { value: 'equipped' as const, label: 'Equipped' },
  { value: 'unequipped' as const, label: 'Unused' },
]
const lockOptions = [
  { value: 'all' as const, label: 'Lock' },
  { value: 'locked' as const, label: 'Locked' },
  { value: 'unlocked' as const, label: 'Unlocked' },
]

function toggleType(t: WeaponType) {
  filters.value.type = filters.value.type === t ? 'all' : t
}
function toggleRarity(r: Exclude<RarityFilter, 'all'>) {
  filters.value.rarity = filters.value.rarity === r ? 'all' : r
}
</script>

<template>
  <UiToolbar label="Filter weapons">
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
          title="Weapon, type or character"
          autocomplete="off"
        />
      </label>
      <SortControl
        v-model:sort="sort"
        v-model:direction="direction"
        class="min-w-0 flex-1 sm:w-48 sm:flex-none"
        :options="WEAPON_SORTS"
      />
      <UiSegmented v-model="view" :options="VIEWS" label="View" icon-only />
    </div>

    <div
      class="scroll-hide scroll-fade-x -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
      role="group"
      aria-label="Type, rarity and refinement"
    >
      <FilterChip
        v-for="t in WEAPON_TYPES"
        :key="t"
        :pressed="filters.type === t"
        :count="typeCounts.get(t) ?? 0"
        @toggle="toggleType(t)"
      >
        {{ WEAPON_TYPE_LABELS[t] }}
      </FilterChip>
      <span class="my-1 w-px shrink-0 bg-border-default" aria-hidden="true" />
      <FilterChip
        v-for="r in RARITIES"
        :key="r.value"
        :pressed="filters.rarity === r.value"
        :count="rarityCounts.get(r.value) ?? 0"
        @toggle="toggleRarity(r.value)"
      >
        <span :class="r.tone">{{ r.label }}</span>
      </FilterChip>
      <span class="my-1 w-px shrink-0 bg-border-default" aria-hidden="true" />
      <FilterChip
        :pressed="filters.refinable"
        :count="refinableCount"
        title="Weapons whose spare copies could refine an equipped one"
        @toggle="filters.refinable = !filters.refinable"
      >
        <ArrowUp class="size-4 text-success-text" aria-hidden="true" />
        Refinable
      </FilterChip>
    </div>

    <div class="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <label class="min-w-0 sm:w-36">
        <span class="sr-only">Equipped</span>
        <UiSelect v-model="filters.status" :options="statusOptions" />
      </label>
      <label class="min-w-0 sm:w-32">
        <span class="sr-only">Lock</span>
        <UiSelect v-model="filters.lock" :options="lockOptions" />
      </label>
      <label class="min-w-0 sm:w-32">
        <span class="sr-only">Level</span>
        <UiSelect v-model="filters.level" :options="LEVEL_OPTIONS" />
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
  </UiToolbar>
</template>
