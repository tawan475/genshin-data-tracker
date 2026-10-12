<script setup lang="ts">
import { Lock, Search } from 'lucide-vue-next'
import type { AnecdoteCompletion, AnecdoteFilters } from '@/data/anecdote-progress'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { formatNumber } from '@/lib/format'

export interface AreaTab {
  id: number
  name: string
  done: number
  total: number
  /** False when the newest capture says the book lacks this tab. */
  unlocked: boolean | null
}

/** Search and completion, the area tabs (done / total each), and the "shown / total · Clear" readout. */
defineProps<{
  areas: AreaTab[]
  done: number
  total: number
  /** Rows shown / listed in the chosen area(s), displayed while filtering. */
  shown: number
  listed: number
  filtered: boolean
}>()
const filters = defineModel<AnecdoteFilters>('filters', { required: true })
/** Done rows in full instead of folded (the All view only; remembered per device). */
const showDone = defineModel<boolean>('showDone', { required: true })
defineEmits<{ clear: [] }>()

const COMPLETION: { value: AnecdoteCompletion; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Not done' },
  { value: 'done', label: 'Done' },
]
</script>

<template>
  <UiToolbar label="Filter anecdotes">
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
          title="Title, story, NPC or id"
          autocomplete="off"
        />
      </label>
      <div class="flex gap-2" role="radiogroup" aria-label="Completion">
        <FilterChip
          v-for="option in COMPLETION"
          :key="option.value"
          radio
          :pressed="filters.completion === option.value"
          @toggle="filters.completion = option.value"
          >{{ option.label }}</FilterChip
        >
      </div>
      <FilterChip
        v-if="filters.completion === 'all'"
        :pressed="showDone"
        title="Done anecdotes in full instead of folded under each NPC"
        @toggle="showDone = !showDone"
        >Show done</FilterChip
      >
    </div>

    <div
      class="scroll-hide scroll-fade-x -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
      role="radiogroup"
      aria-label="Area"
    >
      <FilterChip radio :pressed="filters.area === null" @toggle="filters.area = null">
        All
        <span class="tabular font-mono text-text-muted"
          >{{ formatNumber(done) }}/{{ formatNumber(total) }}</span
        >
      </FilterChip>
      <FilterChip
        v-for="area in areas"
        :key="area.id"
        radio
        :pressed="filters.area === area.id"
        :title="area.unlocked === false ? 'Not unlocked in the newest capture' : undefined"
        @toggle="filters.area = area.id"
      >
        <Lock v-if="area.unlocked === false" class="size-3.5" aria-hidden="true" />
        {{ area.name }}
        <span
          class="tabular font-mono"
          :class="
            area.total > 0 && area.done >= area.total ? 'text-success-text' : 'text-text-muted'
          "
          >{{ formatNumber(area.done) }}/{{ formatNumber(area.total) }}</span
        >
      </FilterChip>
    </div>

    <div v-if="filtered" class="flex items-center gap-2 text-sm text-text-secondary">
      <span class="tabular font-mono">{{ formatNumber(shown) }} / {{ formatNumber(listed) }}</span>
      <UiButton variant="ghost" size="sm" @click="$emit('clear')">Clear</UiButton>
    </div>
  </UiToolbar>
</template>
