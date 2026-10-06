<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { ELEMENTS, ELEMENT_LABELS, WEAPON_TYPES, WEAPON_TYPE_LABELS } from '@/data/characters'
import type { Element } from '@/data/game-meta'
import { GOAL_SORTS, type GoalFilters, type GoalSort, type GoalStatus } from './goal-list'

/**
 * Search, sort and the goal filters: status (all / in stock / counted /
 * paused), element and rarity chips with counts, weapon type.
 */
defineProps<{
  statusCounts: ReadonlyMap<GoalStatus, number>
  elementCounts: ReadonlyMap<Element | null, number>
  rarityCounts: ReadonlyMap<number | null, number>
  /** Rarities to offer, highest first. */
  rarities: readonly number[]
  filtered: boolean
}>()
const filters = defineModel<GoalFilters>('filters', { required: true })
const sort = defineModel<GoalSort>('sort', { required: true })
defineEmits<{ clear: [] }>()

const STATUSES: { value: GoalStatus; label: string; title?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'In stock', title: 'Enough in the bag, each goal on its own' },
  { value: 'active', label: 'Counted', title: 'In the totals' },
  { value: 'off', label: 'Paused', title: 'Left out of the totals' },
]

const weaponOptions = [
  { value: 'all' as const, label: 'Weapon' },
  ...WEAPON_TYPES.map((w) => ({ value: w, label: WEAPON_TYPE_LABELS[w] })),
]
const sortOptions = GOAL_SORTS.map((s) => ({ value: s.value, label: s.label }))

function setStatus(value: GoalStatus) {
  filters.value.status = filters.value.status === value ? 'all' : value
}
function toggleElement(e: Element) {
  filters.value.element = filters.value.element === e ? 'all' : e
}
function toggleRarity(r: number) {
  filters.value.rarity = filters.value.rarity === r ? 'all' : r
}
</script>

<template>
  <UiToolbar label="Filter goals">
    <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <label class="relative col-span-2 min-w-0 sm:flex-1">
        <span class="sr-only">Search</span>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <UiInput
          v-model="filters.query"
          class="pl-9"
          placeholder="Search"
          type="search"
          autocomplete="off"
          title="Name, weapon or note"
        />
      </label>
      <label class="min-w-0 sm:w-36" :title="GOAL_SORTS.find((s) => s.value === sort)?.title">
        <span class="sr-only">Sort</span>
        <UiSelect v-model="sort" :options="sortOptions" />
      </label>
      <label class="min-w-0 sm:w-36">
        <span class="sr-only">Weapon type</span>
        <UiSelect v-model="filters.weaponType" :options="weaponOptions" />
      </label>
    </div>

    <div
      class="scroll-hide scroll-fade-x -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
      role="group"
      aria-label="Status, element and rarity"
    >
      <FilterChip
        v-for="s in STATUSES"
        :key="s.value"
        :pressed="filters.status === s.value"
        :count="statusCounts.get(s.value) ?? 0"
        :title="s.title"
        @toggle="setStatus(s.value)"
        >{{ s.label }}</FilterChip
      >
      <span class="my-1 w-px shrink-0 bg-border-default" aria-hidden="true" />
      <FilterChip
        v-for="e in ELEMENTS"
        :key="e"
        :pressed="filters.element === e"
        :count="elementCounts.get(e) ?? 0"
        @toggle="toggleElement(e)"
      >
        <ElementIcon :element="e" decorative size="sm" />
        {{ ELEMENT_LABELS[e] }}
      </FilterChip>
      <span class="my-1 w-px shrink-0 bg-border-default" aria-hidden="true" />
      <FilterChip
        v-for="r in rarities"
        :key="r"
        :pressed="filters.rarity === r"
        :count="rarityCounts.get(r) ?? 0"
        @toggle="toggleRarity(r)"
      >
        <span :class="r === 5 ? 'text-rarity-5' : r === 4 ? 'text-rarity-4' : 'text-rarity-3'"
          >{{ r }}★</span
        >
      </FilterChip>
      <UiButton
        v-if="filtered"
        variant="ghost"
        size="sm"
        class="self-center"
        @click="$emit('clear')"
        >Clear</UiButton
      >
    </div>
  </UiToolbar>
</template>
