<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  Gem,
  Search,
  SlidersHorizontal,
  Star,
  Trophy,
  X,
} from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import {
  BEST_PER_SLOT,
  LEVEL_MAX,
  LEVEL_MIN,
  SLOT_KEYS,
  SORT_OPTIONS,
  clearedFilters,
  defaultDescending,
  isSparePreset,
  toggleSparePreset,
  type ArtifactFilters,
  type ArtifactSort,
  type AstralFilter,
  type EquipFilter,
  type LockFilter,
  type SetOption,
} from '@/data/artifacts'
import { formatNumber } from '@/lib/format'
import { readJson, writeJson } from '@/lib/storage'
import { formatSetName, formatSlotName, formatStatName } from '@/utils/artifact-stats'
import ArtifactSetPicker from './ArtifactSetPicker.vue'
import ChoiceGroup from './ChoiceGroup.vue'
import FilterPill from './FilterPill.vue'
import { SLOT_ICONS } from './styles'

/**
 * Search, sort and every filter, plus the active filters as removable pills.
 * Counts next to options are "matches if you pick this", with all the other
 * filters applied. Labels only: explanations go in `title` tooltips.
 */
const props = defineProps<{
  sets: SetOption[]
  /** Preset sizes over the whole inventory. */
  spareCount: number
  maxedCount: number
  slotCounts: ReadonlyMap<string, number>
  /** Rarities present in the inventory, highest first. */
  rarities: number[]
  rarityCounts: ReadonlyMap<number, number>
  mainStats: { key: string; count: number }[]
}>()
const filters = defineModel<ArtifactFilters>({ required: true })

function patch(change: Partial<ArtifactFilters>) {
  filters.value = { ...filters.value, ...change }
}

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const searchId = useId()
const moreId = useId()

const search = computed({
  get: () => filters.value.search,
  set: (search: string) => patch({ search }),
})
const sort = computed({
  get: () => filters.value.sort,
  set: (sort: ArtifactSort) => patch({ sort, descending: defaultDescending(sort) }),
})
const mainStat = computed({
  get: () => filters.value.mainStat,
  set: (mainStat: string) => patch({ mainStat }),
})
const levelMin = computed({
  get: () => filters.value.levelMin,
  set: (min: number) => patch({ levelMin: min, levelMax: Math.max(min, filters.value.levelMax) }),
})
const levelMax = computed({
  get: () => filters.value.levelMax,
  set: (max: number) => patch({ levelMax: max, levelMin: Math.min(max, filters.value.levelMin) }),
})
const lock = computed({
  get: () => filters.value.lock,
  set: (lock: LockFilter) => patch({ lock }),
})
const equipped = computed({
  get: () => filters.value.equipped,
  set: (equipped: EquipFilter) => patch({ equipped }),
})
const astral = computed({
  get: () => filters.value.astral,
  set: (astral: AstralFilter) => patch({ astral }),
})

const RARITY_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-rarity-3',
  2: 'text-rarity-2',
  1: 'text-rarity-1',
}

const levelOptions = Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, i) => ({
  value: LEVEL_MIN + i,
  label: `+${LEVEL_MIN + i}`,
}))
const mainStatOptions = computed(() => [
  { value: '', label: 'Any' },
  ...props.mainStats.map((s) => ({
    value: s.key,
    label: `${formatStatName(s.key)} (${formatNumber(s.count)})`,
  })),
])

const maxOnly = computed(() => filters.value.levelMin === LEVEL_MAX)
function toggleMaxOnly() {
  patch(maxOnly.value ? { levelMin: LEVEL_MIN } : { levelMin: LEVEL_MAX, levelMax: LEVEL_MAX })
}

const spare = computed(() => isSparePreset(filters.value))

// "More filters" stays open or closed per device; it opens by itself when
// one of the filters inside it is in use, so nothing active is hidden.
const moreCount = computed(() => {
  const f = filters.value
  return (
    Number(f.mainStat !== '') +
    Number(f.levelMin > LEVEL_MIN || f.levelMax < LEVEL_MAX) +
    Number(f.lock !== 'any') +
    Number(f.equipped !== 'any') +
    Number(f.astral !== 'any')
  )
})
const moreOpen = ref(readJson<boolean>('artifacts:more-filters', false) || moreCount.value > 0)
watch(moreOpen, (open) => writeJson('artifacts:more-filters', open))

const pickerOpen = ref(false)
const selectedSets = computed({
  get: () => filters.value.sets,
  set: (sets: string[]) => patch({ sets }),
})
const setsTitle = computed(() => filters.value.sets.map(formatSetName).join(', ') || 'All sets')

interface Pill {
  id: string
  label: string
  remove: () => void
}

const LOCK_LABEL: Record<LockFilter, string> = { any: '', locked: 'Locked', unlocked: 'Unlocked' }
const EQUIP_LABEL: Record<EquipFilter, string> = {
  any: '',
  equipped: 'Equipped',
  inventory: 'Unequipped',
}
const ASTRAL_LABEL: Record<AstralFilter, string> = {
  any: '',
  marked: 'Astral',
  unmarked: 'No astral',
}

const pills = computed<Pill[]>(() => {
  const f = filters.value
  const out: Pill[] = []
  const text = f.search.trim()
  if (text) out.push({ id: 'search', label: `“${text}”`, remove: () => patch({ search: '' }) })
  for (const key of f.sets) {
    out.push({
      id: `set:${key}`,
      label: formatSetName(key),
      remove: () => patch({ sets: filters.value.sets.filter((k) => k !== key) }),
    })
  }
  for (const slot of f.slots) {
    out.push({
      id: `slot:${slot}`,
      label: formatSlotName(slot),
      remove: () => patch({ slots: filters.value.slots.filter((s) => s !== slot) }),
    })
  }
  if (f.mainStat) {
    out.push({
      id: 'main',
      label: `Main: ${formatStatName(f.mainStat)}`,
      remove: () => patch({ mainStat: '' }),
    })
  }
  for (const rarity of [...f.rarities].sort((a, b) => b - a)) {
    out.push({
      id: `rarity:${rarity}`,
      label: `${rarity}★`,
      remove: () => patch({ rarities: filters.value.rarities.filter((r) => r !== rarity) }),
    })
  }
  if (f.levelMin > LEVEL_MIN || f.levelMax < LEVEL_MAX) {
    out.push({
      id: 'level',
      label: f.levelMin === f.levelMax ? `+${f.levelMin}` : `+${f.levelMin}–${f.levelMax}`,
      remove: () => patch({ levelMin: LEVEL_MIN, levelMax: LEVEL_MAX }),
    })
  }
  if (f.lock !== 'any')
    out.push({ id: 'lock', label: LOCK_LABEL[f.lock], remove: () => patch({ lock: 'any' }) })
  if (f.equipped !== 'any') {
    out.push({
      id: 'equipped',
      label: EQUIP_LABEL[f.equipped],
      remove: () => patch({ equipped: 'any' }),
    })
  }
  if (f.astral !== 'any') {
    out.push({
      id: 'astral',
      label: ASTRAL_LABEL[f.astral],
      remove: () => patch({ astral: 'any' }),
    })
  }
  if (f.best) out.push({ id: 'best', label: 'Best', remove: () => patch({ best: false }) })
  return out
})

function clearAll() {
  filters.value = clearedFilters(filters.value)
}
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-raised p-3 shadow-card sm:p-4"
    aria-label="Filters"
  >
    <div class="flex flex-wrap gap-2">
      <div class="relative min-w-0 flex-auto basis-56">
        <label :for="searchId" class="sr-only">Search sets or characters</label>
        <Search
          class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          :id="searchId"
          v-model="search"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Search"
          title="Set or character"
          class="min-h-11 w-full rounded-xl border border-border-default bg-surface-raised pr-3.5 pl-10 text-base text-text-primary transition-colors placeholder:text-text-muted focus:border-accent"
        />
      </div>

      <div class="flex min-w-0 flex-auto gap-2 sm:flex-none">
        <button
          type="button"
          class="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-surface-raised px-3.5 text-base transition-colors hover:bg-surface-overlay sm:flex-none"
          :class="filters.sets.length ? 'border-accent-text' : 'border-border-default'"
          :title="setsTitle"
          aria-haspopup="dialog"
          @click="pickerOpen = true"
        >
          <Gem class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          Sets
          <span v-if="filters.sets.length" class="tabular font-mono text-accent-text">
            {{ filters.sets.length }}
          </span>
          <ChevronDown class="ml-auto size-4 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
        <label class="shrink-0" title="Sort">
          <span class="sr-only">Sort by</span>
          <UiSelect v-model="sort" :options="SORT_OPTIONS" class="w-28" />
        </label>
        <UiIconButton
          :label="filters.descending ? 'Descending' : 'Ascending'"
          @click="patch({ descending: !filters.descending })"
        >
          <ArrowDownWideNarrow v-if="filters.descending" class="size-5" aria-hidden="true" />
          <ArrowUpNarrowWide v-else class="size-5" aria-hidden="true" />
        </UiIconButton>
      </div>
    </div>

    <div
      class="-mx-3 flex items-center gap-2 overflow-x-auto px-3 py-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <div role="group" aria-label="Slot" class="flex gap-2 sm:flex-wrap">
        <FilterPill
          v-for="slot in SLOT_KEYS"
          :key="slot"
          :pressed="filters.slots.includes(slot)"
          :title="formatSlotName(slot)"
          @toggle="patch({ slots: toggled(filters.slots, slot) })"
        >
          <component :is="SLOT_ICONS[slot]" class="size-4 shrink-0" aria-hidden="true" />
          <span class="sr-only">{{ formatSlotName(slot) }}</span>
          <span class="tabular font-mono text-text-muted">
            {{ formatNumber(slotCounts.get(slot) ?? 0) }}
          </span>
        </FilterPill>
      </div>

      <span class="h-6 w-px shrink-0 bg-border-default" aria-hidden="true" />

      <div role="group" aria-label="Rarity" class="flex gap-2 sm:flex-wrap">
        <FilterPill
          v-for="rarity in rarities"
          :key="rarity"
          :pressed="filters.rarities.includes(rarity)"
          :title="`${rarity}-star`"
          @toggle="patch({ rarities: toggled(filters.rarities, rarity) })"
        >
          <span class="flex items-center gap-0.5">
            <span class="tabular font-mono">{{ rarity }}</span>
            <Star class="size-3.5 fill-current" :class="RARITY_TEXT[rarity]" aria-hidden="true" />
            <span class="sr-only">-star</span>
          </span>
          <span class="tabular font-mono text-text-muted">
            {{ formatNumber(rarityCounts.get(rarity) ?? 0) }}
          </span>
        </FilterPill>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <div
        role="group"
        aria-label="Presets"
        class="-ml-3 flex items-center gap-2 overflow-x-auto pl-3 py-0.5 [scrollbar-width:none] sm:ml-0 sm:flex-wrap sm:overflow-visible sm:pl-0 min-w-0 flex-1"
      >
        <FilterPill
          :pressed="filters.best"
          :title="`Top ${BEST_PER_SLOT} per slot, by the current sort`"
          @toggle="patch({ best: !filters.best })"
        >
          <Trophy class="size-4 shrink-0" aria-hidden="true" />
          Best
        </FilterPill>
        <FilterPill
          :pressed="spare"
          title="Unequipped 5★"
          @toggle="filters = toggleSparePreset(filters)"
        >
          Spare 5★
          <span class="tabular font-mono text-text-muted">{{ formatNumber(spareCount) }}</span>
        </FilterPill>
        <FilterPill :pressed="maxOnly" title="Level +20 only" @toggle="toggleMaxOnly">
          <span class="tabular font-mono">+20</span>
          <span class="tabular font-mono text-text-muted">{{ formatNumber(maxedCount) }}</span>
        </FilterPill>
      </div>

      <button
        type="button"
        class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        :aria-expanded="moreOpen"
        :aria-controls="moreId"
        title="Main stat, level, lock, location, astral mark"
        @click="moreOpen = !moreOpen"
      >
        <SlidersHorizontal class="size-4" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">More</span>
        <span v-if="moreCount" class="tabular font-mono text-accent-text">{{ moreCount }}</span>
      </button>
    </div>

    <div
      v-show="moreOpen"
      :id="moreId"
      class="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-border-subtle pt-3"
    >
      <label class="flex w-full min-w-0 flex-col gap-1.5 sm:w-48">
        <span class="text-sm font-medium text-text-secondary">Main stat</span>
        <UiSelect v-model="mainStat" :options="mainStatOptions" />
      </label>
      <div class="flex gap-2">
        <label class="flex w-24 flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary">Min</span>
          <UiSelect v-model="levelMin" :options="levelOptions" />
        </label>
        <label class="flex w-24 flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary">Max</span>
          <UiSelect v-model="levelMax" :options="levelOptions" />
        </label>
      </div>
      <ChoiceGroup
        v-model="lock"
        label="Lock"
        :options="[
          { value: 'any', label: 'All' },
          { value: 'locked', label: 'Locked' },
          { value: 'unlocked', label: 'Unlocked' },
        ]"
      />
      <ChoiceGroup
        v-model="equipped"
        label="Location"
        :options="[
          { value: 'any', label: 'All' },
          { value: 'equipped', label: 'Equipped' },
          { value: 'inventory', label: 'Unequipped' },
        ]"
      />
      <ChoiceGroup
        v-model="astral"
        label="Astral mark"
        :options="[
          { value: 'any', label: 'All' },
          { value: 'marked', label: 'Yes' },
          { value: 'unmarked', label: 'No' },
        ]"
      />
    </div>

    <div
      v-if="pills.length"
      class="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3"
    >
      <button
        v-for="pill in pills"
        :key="pill.id"
        type="button"
        class="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border border-border-default bg-surface-overlay px-3 text-sm transition-colors hover:border-border-strong"
        :aria-label="`Remove ${pill.label}`"
        :title="`Remove ${pill.label}`"
        @click="pill.remove()"
      >
        <span class="truncate">{{ pill.label }}</span>
        <X class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
      <UiButton variant="ghost" @click="clearAll">Clear</UiButton>
    </div>

    <ArtifactSetPicker
      v-model="selectedSets"
      :open="pickerOpen"
      :options="sets"
      @close="pickerOpen = false"
    />
  </section>
</template>
