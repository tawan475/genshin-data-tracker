<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  Gem,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import {
  ARTIFACT_RARITIES,
  BEST_PER_SLOT,
  LEVEL_MAX,
  LEVEL_MIN,
  SLOT_KEYS,
  SORT_OPTIONS,
  SUBSTAT_KEYS,
  clearedFilters,
  defaultDescending,
  isFeedablePreset,
  isSparePreset,
  isZeroPreset,
  toggleFeedablePreset,
  toggleSparePreset,
  toggleZeroPreset,
  type ArtifactFilters,
  type ArtifactSort,
  type AstralFilter,
  type ElixirFilter,
  type EquipFilter,
  type LinesFilter,
  type LockFilter,
  type SetOption,
} from '@/data/artifacts'
import { loadFlag, saveFlag } from '@/data/artifact-prefs'
import { formatNumber } from '@/lib/format'
import {
  formatSetName,
  formatSlotName,
  formatStatName,
  formatStatTiny,
} from '@/utils/artifact-stats'
import ArtifactSetPicker from './ArtifactSetPicker.vue'
import { SLOT_ICONS } from './styles'

/**
 * Search, sort and every filter, plus the active filters as removable pills.
 * Counts next to options are "matches if you pick this", with all the other
 * filters applied. Labels only: explanations go in `title` tooltips.
 */
const props = defineProps<{
  sets: SetOption[]
  /** Characters wearing pieces, for "Equipped by". */
  owners: SetOption[]
  /** Preset sizes over the whole inventory. */
  feedableCount: number
  spareCount: number
  maxedCount: number
  zeroCount: number
  /** Pieces the previous capture lacked; null without a previous capture. */
  newCount: number | null
  slotCounts: ReadonlyMap<string, number>
  rarityCounts: ReadonlyMap<number, number>
  /** Rarities the inventory has at all. */
  present: ReadonlySet<number>
  mainStats: { key: string; count: number }[]
  substatCounts: ReadonlyMap<string, number>
  lineCounts: ReadonlyMap<number, number>
}>()
const filters = defineModel<ArtifactFilters>({ required: true })

function patch(change: Partial<ArtifactFilters>) {
  filters.value = { ...filters.value, ...change }
}

function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const moreId = useId()

const search = computed({
  get: () => filters.value.search,
  set: (search: string) => patch({ search }),
})
const sort = computed({
  get: () => filters.value.sort,
  set: (sort: ArtifactSort) => patch({ sort, descending: defaultDescending(sort) }),
})
const sortTitle = computed(
  () => SORT_OPTIONS.find((o) => o.value === filters.value.sort)?.title ?? 'Sort',
)
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
const elixir = computed({
  get: () => filters.value.elixir,
  set: (elixir: ElixirFilter) => patch({ elixir }),
})
const lines = computed({
  get: () => filters.value.lines,
  set: (lines: LinesFilter) => patch({ lines }),
})

const RARITY_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-rarity-3',
  2: 'text-rarity-2',
  1: 'text-rarity-1',
}

const LOCK_OPTIONS: { value: LockFilter; label: string }[] = [
  { value: 'any', label: 'All' },
  { value: 'locked', label: 'Locked' },
  { value: 'unlocked', label: 'Unlocked' },
]
const EQUIP_OPTIONS: { value: EquipFilter; label: string }[] = [
  { value: 'any', label: 'All' },
  { value: 'equipped', label: 'Equipped' },
  { value: 'inventory', label: 'Unequipped' },
]
const ASTRAL_OPTIONS: { value: AstralFilter; label: string }[] = [
  { value: 'any', label: 'All' },
  { value: 'marked', label: 'Yes' },
  { value: 'unmarked', label: 'No' },
]
const ELIXIR_OPTIONS: { value: ElixirFilter; label: string }[] = [
  { value: 'any', label: 'All' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]
const lineOptions = computed(() => [
  { value: 0 as LinesFilter, label: 'All' },
  ...([4, 3] as const).map((n) => ({
    value: n as LinesFilter,
    label: `${n}`,
    count: props.lineCounts.get(n) ?? 0,
    title: `${n} lines now`,
  })),
])
const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))

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

const feedable = computed(() => isFeedablePreset(filters.value))
const spare = computed(() => isSparePreset(filters.value))
const zero = computed(() => isZeroPreset(filters.value))

// "More filters" stays open or closed per device and opens by itself when a
// filter inside it is in use, so nothing active is hidden. On a phone it
// always starts closed: its count badge and the pills show what is on.
const moreCount = computed(() => {
  const f = filters.value
  return (
    Number(f.mainStat !== '') +
    Number(f.substats.length > 0) +
    Number(f.lines !== 0) +
    Number(f.levelMin > LEVEL_MIN || f.levelMax < LEVEL_MAX) +
    Number(f.lock !== 'any') +
    Number(f.equipped !== 'any') +
    Number(f.owners.length > 0) +
    Number(f.astral !== 'any') +
    Number(f.elixir !== 'any')
  )
})
const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches
const moreOpen = ref(!phone && (loadFlag('more-filters', false) || moreCount.value > 0))
watch(moreOpen, (open) => saveFlag('more-filters', open))

const pickerOpen = ref(false)
const ownersOpen = ref(false)
const selectedSets = computed({
  get: () => filters.value.sets,
  set: (sets: string[]) => patch({ sets }),
})
const selectedOwners = computed({
  get: () => filters.value.owners,
  set: (owners: string[]) => patch({ owners }),
})
const setsTitle = computed(() => filters.value.sets.map(formatSetName).join(', ') || 'All sets')
const ownerName = (key: string) => props.owners.find((o) => o.key === key)?.name ?? key
const ownersTitle = computed(() => filters.value.owners.map(ownerName).join(', ') || 'Anyone')

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
const ELIXIR_LABEL: Record<ElixirFilter, string> = { any: '', yes: 'Elixir', no: 'No elixir' }

const pills = computed<Pill[]>(() => {
  const f = filters.value
  const out: Pill[] = []
  const text = f.search.trim()
  if (text) out.push({ id: 'search', label: `“${text}”`, remove: () => patch({ search: '' }) })
  if (f.fresh) out.push({ id: 'fresh', label: 'New', remove: () => patch({ fresh: false }) })
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
  if (f.substats.length) {
    out.push({
      id: 'substats',
      label: f.substats.map(formatStatTiny).join(' + '),
      remove: () => patch({ substats: [] }),
    })
  }
  if (f.lines) {
    out.push({ id: 'lines', label: `${f.lines} lines`, remove: () => patch({ lines: 0 }) })
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
  for (const key of f.owners) {
    out.push({
      id: `owner:${key}`,
      label: ownerName(key),
      remove: () => patch({ owners: filters.value.owners.filter((k) => k !== key) }),
    })
  }
  if (f.astral !== 'any') {
    out.push({
      id: 'astral',
      label: ASTRAL_LABEL[f.astral],
      remove: () => patch({ astral: 'any' }),
    })
  }
  if (f.elixir !== 'any') {
    out.push({
      id: 'elixir',
      label: ELIXIR_LABEL[f.elixir],
      remove: () => patch({ elixir: 'any' }),
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
  <UiToolbar label="Filter artifacts">
    <div class="flex flex-wrap gap-2">
      <label class="relative min-w-0 flex-auto basis-56">
        <span class="sr-only">Search sets or characters</span>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <UiInput
          v-model="search"
          type="search"
          class="pl-9"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Search"
          title="Set or character"
        />
      </label>

      <div class="flex min-w-0 flex-auto gap-2 sm:flex-none">
        <UiButton
          class="min-w-0 flex-1 sm:flex-none"
          :class="filters.sets.length ? 'border-accent-text!' : ''"
          :title="setsTitle"
          aria-haspopup="dialog"
          @click="pickerOpen = true"
        >
          <Gem class="size-4 shrink-0" aria-hidden="true" />
          Sets
          <span v-if="filters.sets.length" class="tabular font-mono text-accent-text">
            {{ filters.sets.length }}
          </span>
          <ChevronDown class="ml-auto size-4 shrink-0 text-text-muted" aria-hidden="true" />
        </UiButton>
        <label class="shrink-0" :title="sortTitle">
          <span class="sr-only">Sort by</span>
          <UiSelect v-model="sort" :options="sortOptions" class="w-32" />
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
      class="scroll-hide scroll-fade-x -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <div role="group" aria-label="Slot" class="flex gap-2 sm:flex-wrap">
        <FilterChip
          v-for="slot in SLOT_KEYS"
          :key="slot"
          :pressed="filters.slots.includes(slot)"
          :count="slotCounts.get(slot) ?? 0"
          :title="formatSlotName(slot)"
          @toggle="patch({ slots: toggled(filters.slots, slot) })"
        >
          <component :is="SLOT_ICONS[slot]" class="size-4 shrink-0" aria-hidden="true" />
          <span class="sr-only">{{ formatSlotName(slot) }}</span>
        </FilterChip>
      </div>

      <span class="h-6 w-px shrink-0 bg-border-default" aria-hidden="true" />

      <div role="group" aria-label="Rarity" class="flex gap-2 sm:flex-wrap">
        <FilterChip
          v-for="rarity in ARTIFACT_RARITIES"
          :key="rarity"
          :pressed="filters.rarities.includes(rarity)"
          :count="rarityCounts.get(rarity) ?? 0"
          :title="present.has(rarity) ? undefined : 'None in this capture'"
          @toggle="patch({ rarities: toggled(filters.rarities, rarity) })"
        >
          <span :class="RARITY_TEXT[rarity]">{{ rarity }}★</span>
        </FilterChip>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <div
        role="group"
        aria-label="Presets"
        class="scroll-hide scroll-fade-x -ml-3 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pl-3 sm:ml-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:pl-0"
      >
        <FilterChip
          :pressed="filters.best"
          :title="`Top ${BEST_PER_SLOT} per slot, by the current sort`"
          @toggle="patch({ best: !filters.best })"
        >
          <Trophy class="size-4 shrink-0" aria-hidden="true" />
          Best
        </FilterChip>
        <FilterChip
          :pressed="filters.fresh"
          :count="newCount ?? 0"
          :title="
            newCount === null
              ? 'No earlier capture to compare with'
              : 'Not in the previous capture: new, or levelled since'
          "
          @toggle="patch({ fresh: !filters.fresh })"
        >
          <Sparkles class="size-4 shrink-0" aria-hidden="true" />
          New
        </FilterChip>
        <FilterChip
          :pressed="zero"
          :count="zeroCount"
          title="Unequipped 5★ at +0"
          @toggle="filters = toggleZeroPreset(filters)"
        >
          <span class="tabular font-mono">+0</span> 5★
        </FilterChip>
        <FilterChip
          :pressed="feedable"
          :count="feedableCount"
          title="Unlocked, unequipped 4★ and 3★"
          @toggle="filters = toggleFeedablePreset(filters)"
        >
          4★/3★ Artifact
        </FilterChip>
        <FilterChip
          :pressed="spare"
          :count="spareCount"
          title="Unequipped 5★"
          @toggle="filters = toggleSparePreset(filters)"
        >
          Spare 5★
        </FilterChip>
        <FilterChip
          :pressed="maxOnly"
          :count="maxedCount"
          title="Level +20 only"
          @toggle="toggleMaxOnly"
        >
          <span class="tabular font-mono">+20</span>
        </FilterChip>
      </div>

      <UiButton
        variant="ghost"
        class="shrink-0 px-3"
        :aria-expanded="moreOpen"
        :aria-controls="moreId"
        title="Main stat, substats, lines, level, lock, location, wearer, astral mark, elixir"
        @click="moreOpen = !moreOpen"
      >
        <SlidersHorizontal class="size-4" aria-hidden="true" />
        <span class="sr-only sm:not-sr-only">More</span>
        <span v-if="moreCount" class="tabular font-mono text-accent-text">{{ moreCount }}</span>
      </UiButton>
    </div>

    <div
      v-show="moreOpen"
      :id="moreId"
      class="flex flex-col gap-3 border-t border-border-subtle pt-3"
    >
      <div class="flex flex-col gap-1.5">
        <span
          class="text-sm font-medium text-text-secondary"
          title="Has all of these (the line +4 opens counts)"
          >Substats</span
        >
        <div
          role="group"
          aria-label="Substats"
          class="scroll-hide scroll-fade-x -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <FilterChip
            v-for="key in SUBSTAT_KEYS"
            :key="key"
            :pressed="filters.substats.includes(key)"
            :count="substatCounts.get(key) ?? 0"
            :title="formatStatName(key)"
            @toggle="patch({ substats: toggled(filters.substats, key) })"
          >
            {{ formatStatTiny(key) }}
          </FilterChip>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label class="flex w-full min-w-0 flex-col gap-1.5 sm:w-48">
          <span class="text-sm font-medium text-text-secondary">Main stat</span>
          <UiSelect v-model="mainStat" :options="mainStatOptions" />
        </label>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true">Lines</span>
          <UiSegmented v-model="lines" :options="lineOptions" label="Lines" />
        </div>
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
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true">Lock</span>
          <UiSegmented v-model="lock" :options="LOCK_OPTIONS" label="Lock" />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true">Location</span>
          <UiSegmented v-model="equipped" :options="EQUIP_OPTIONS" label="Location" />
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true"
            >Equipped by</span
          >
          <UiButton
            :class="filters.owners.length ? 'border-accent-text!' : ''"
            :title="ownersTitle"
            aria-haspopup="dialog"
            aria-label="Equipped by"
            @click="ownersOpen = true"
          >
            <UserRound class="size-4 shrink-0" aria-hidden="true" />
            <span v-if="filters.owners.length" class="tabular font-mono text-accent-text">
              {{ filters.owners.length }}
            </span>
            <span v-else>Anyone</span>
            <ChevronDown class="ml-auto size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </UiButton>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true"
            >Astral mark</span
          >
          <UiSegmented v-model="astral" :options="ASTRAL_OPTIONS" label="Astral mark" />
        </div>
        <div class="flex flex-col gap-1.5" title="Sanctifying Elixir">
          <span class="text-sm font-medium text-text-secondary" aria-hidden="true">Elixir</span>
          <UiSegmented v-model="elixir" :options="ELIXIR_OPTIONS" label="Elixir" />
        </div>
      </div>
    </div>

    <div
      v-if="pills.length"
      class="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3"
    >
      <button
        v-for="pill in pills"
        :key="pill.id"
        type="button"
        class="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        :aria-label="`Remove ${pill.label}`"
        :title="`Remove ${pill.label}`"
        @click="pill.remove()"
      >
        <span class="truncate">{{ pill.label }}</span>
        <X class="size-4 shrink-0" aria-hidden="true" />
      </button>
      <UiButton variant="ghost" size="sm" @click="clearAll">Clear</UiButton>
    </div>

    <ArtifactSetPicker
      v-model="selectedSets"
      :open="pickerOpen"
      :options="sets"
      @close="pickerOpen = false"
    />
    <ArtifactSetPicker
      v-model="selectedOwners"
      :open="ownersOpen"
      :options="owners"
      title="Equipped by"
      characters
      @close="ownersOpen = false"
    />
  </UiToolbar>
</template>
