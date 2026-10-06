<script setup lang="ts">
import { computed } from 'vue'
import { Eye, EyeOff, ListChecks, ListX, Search } from 'lucide-vue-next'
import type {
  AchievementFilters,
  Completion,
  HiddenFilter,
} from '@/data/achievement-progress'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { formatNumber } from '@/lib/format'
import type { CategoryItem } from './AchievementCategories.vue'

/**
 * Search, completion, category (a select below the wide layout, where the
 * list sits beside), version and hidden filters, plus the bulk marks, which
 * act on what the filters show.
 */
const props = defineProps<{
  categories: CategoryItem[]
  versions: string[]
  /** Achievements shown / in total, displayed while filtering. */
  shown: number
  total: number
  filtered: boolean
  /** Achievements the bulk buttons would change. */
  toMark: number
  toUnmark: number
  /** Completed series (left out of `categories` unless shown). */
  doneSeries: number
}>()
const filters = defineModel<AchievementFilters>('filters', { required: true })
const showDoneSeries = defineModel<boolean>('showDoneSeries', { required: true })
defineEmits<{ clear: []; markAll: []; unmarkAll: [] }>()

const COMPLETION: { value: Completion; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Done' },
  { value: 'missing', label: 'Missing' },
]
const HIDDEN: { value: HiddenFilter; label: string }[] = [
  { value: 'all', label: 'Hidden: any' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'visible', label: 'Not hidden' },
]
const categoryOptions = computed(() => [
  { value: null, label: 'All categories' },
  ...props.categories.map((c) => ({
    value: c.id,
    label: `${c.name} · ${c.count.done}/${c.count.total}`,
  })),
])
const versionOptions = computed(() => [
  { value: null, label: 'Version' },
  ...props.versions.map((v) => ({ value: v, label: v })),
])
</script>

<template>
  <UiToolbar label="Filter achievements">
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
          title="Name, description, category or id"
          autocomplete="off"
        />
      </label>
      <UiSegmented v-model="filters.completion" :options="COMPLETION" label="Completion" />
    </div>

    <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div class="col-span-2 flex min-w-0 gap-2 sm:w-auto lg:hidden">
        <label class="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <span class="sr-only">Category</span>
          <UiSelect v-model="filters.goal" :options="categoryOptions" />
        </label>
        <UiButton
          v-if="doneSeries > 0"
          :aria-pressed="showDoneSeries"
          :title="showDoneSeries ? 'Hide completed series' : 'Show completed series'"
          @click="showDoneSeries = !showDoneSeries"
        >
          <component :is="showDoneSeries ? EyeOff : Eye" class="size-4" aria-hidden="true" />
          <span class="tabular font-mono">{{ doneSeries }}</span>
        </UiButton>
      </div>
      <label class="min-w-0 sm:w-32">
        <span class="sr-only">Version</span>
        <UiSelect v-model="filters.version" :options="versionOptions" title="Added in" />
      </label>
      <label class="min-w-0 sm:w-36">
        <span class="sr-only">Hidden</span>
        <UiSelect v-model="filters.hidden" :options="HIDDEN" />
      </label>

      <div class="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        <template v-if="filtered">
          <span
            class="tabular mr-auto font-mono text-sm text-text-secondary sm:mr-0"
            aria-live="polite"
            >{{ formatNumber(shown) }} / {{ formatNumber(total) }}</span
          >
          <UiButton variant="ghost" size="sm" @click="$emit('clear')">Clear</UiButton>
        </template>
        <UiButton
          size="sm"
          :disabled="toMark === 0"
          :title="`Mark the ${formatNumber(toMark)} shown achievements left done`"
          @click="$emit('markAll')"
        >
          <ListChecks class="size-4" aria-hidden="true" />
          Mark all
        </UiButton>
        <UiButton
          v-if="toUnmark > 0"
          size="sm"
          :title="`Unmark the ${formatNumber(toUnmark)} shown achievements marked by hand`"
          @click="$emit('unmarkAll')"
        >
          <ListX class="size-4" aria-hidden="true" />
          Unmark all
        </UiButton>
      </div>
    </div>
  </UiToolbar>
</template>
