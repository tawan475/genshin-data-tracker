<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useIntersectionObserver } from '@vueuse/core'
import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  List,
  Package,
  Search,
  SearchX,
  Upload,
} from 'lucide-vue-next'
import FilterChip from '@/components/ui/FilterChip.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { formatCompact, formatNumber, formatSigned } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialMatcher, matchRank } from '@/utils/materials'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import type { MaterialItem } from './material-items'
import { KIND_RANK, KINDS, type MaterialKind } from './material-meta'

/**
 * The bag: every material as an icon tile with its count (or a named list),
 * filtered by kind, by what moved, and by name. Renders in pages as it
 * scrolls, so 1,400 materials cost what 150 do.
 */
const props = defineProps<{
  /** Every material held in any snapshot; currencies only show up in a search. */
  items: MaterialItem[]
  changes: Map<string, number>
  /** False when there is nothing to compare with (a single snapshot). */
  compared: boolean
  /** Tooltip end for the changes ("since Jul 12, 2026"). */
  hint: string
  tracked: string[]
  icon: (key: string) => string
  importTo: RouteLocationRaw
  /** Counts set by hand on the Planner (where they differ from the capture's). */
  edited?: ReadonlyMap<string, number>
}>()
/** A tile was opened: the tile, and whether by touch (for the inventory editor). */
const emit = defineEmits<{ open: [key: string, anchor: HTMLElement, touch: boolean] }>()

function open(key: string, event: MouseEvent) {
  emit(
    'open',
    key,
    event.currentTarget as HTMLElement,
    (event as PointerEvent).pointerType === 'touch',
  )
}

// ------------------------------------------------------------------ controls

type Show = 'owned' | 'gained' | 'spent'
type Sort = 'order' | 'count' | 'change' | 'name'
type View = 'grid' | 'list'

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'order', label: 'Game order' },
  { value: 'count', label: 'Count' },
  { value: 'change', label: 'Change' },
  { value: 'name', label: 'Name' },
]
const SORT_KEY = 'materials:sort'
const VIEW_KEY = 'materials:view'

const storedSort = readStorage(SORT_KEY)
const sort = ref<Sort>(
  SORT_OPTIONS.some((o) => o.value === storedSort) ? (storedSort as Sort) : 'order',
)
watch(sort, (value) => writeStorage(SORT_KEY, value))
const view = ref<View>(readStorage(VIEW_KEY) === 'list' ? 'list' : 'grid')
watch(view, (value) => writeStorage(VIEW_KEY, value))

const query = ref('')
const show = ref<Show>('owned')
const kind = ref<MaterialKind | 'all'>('all')

// Nothing to compare with (one snapshot): gained / spent are off.
watch(
  () => props.compared,
  (compared) => {
    if (!compared) show.value = 'owned'
  },
)

const trackedSet = computed(() => new Set(props.tracked))
const changeOf = (key: string) => props.changes.get(key) ?? 0

// ------------------------------------------------------------------ filtering

/** Owned, gained or spent: the pool before name and kind filters. */
const pools = computed(() => {
  const owned: MaterialItem[] = []
  const gained: MaterialItem[] = []
  const spent: MaterialItem[] = []
  for (const item of props.items) {
    // Currencies have the wallet strip; a search still finds them here.
    if (item.wallet) continue
    if (item.count > 0) owned.push(item)
    const change = props.changes.get(item.key) ?? 0
    if (change > 0) gained.push(item)
    else if (change < 0) spent.push(item)
  }
  return { owned, gained, spent }
})

/** After the name search, which also finds currencies and materials now at 0. */
const searched = computed(() => {
  const match = materialMatcher(query.value)
  if (!match) return pools.value[show.value]
  const pool =
    show.value === 'owned'
      ? props.items
      : props.items.filter((item) => (show.value === 'gained' ? 1 : -1) * changeOf(item.key) > 0)
  return pool.filter((item) => match(item.name) || match(item.key))
})

const kindCounts = computed(() => {
  const counts = new Map<MaterialKind, number>()
  for (const item of searched.value) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  return counts
})

const kindChips = computed(() => [
  {
    id: 'all' as const,
    label: 'All',
    detail: 'All kinds',
    icon: null,
    count: searched.value.length,
  },
  ...KINDS.map((k) => ({ ...k, count: kindCounts.value.get(k.id) ?? 0 })),
])

const filtered = computed(() => {
  const list =
    kind.value === 'all' ? searched.value : searched.value.filter((i) => i.kind === kind.value)
  const q = query.value.trim()
  // Gained and spent always list the biggest moves first.
  const by: Sort = show.value === 'owned' ? sort.value : 'change'
  const compare = (a: MaterialItem, b: MaterialItem): number => {
    if (by === 'count') return b.count - a.count
    if (by === 'change') return Math.abs(changeOf(b.key)) - Math.abs(changeOf(a.key))
    if (by === 'name') return a.name.localeCompare(b.name)
    // Game order: build materials first (talent, gems, boss…), then by item id.
    return KIND_RANK.get(a.kind)! - KIND_RANK.get(b.kind)! || a.order - b.order
  }
  return [...list].sort(
    (a, b) =>
      (q ? matchRank(a.name, q) - matchRank(b.name, q) : 0) ||
      compare(a, b) ||
      a.order - b.order ||
      a.name.localeCompare(b.name),
  )
})

// ------------------------------------------------------------------ paging

const PAGE = { grid: 168, list: 90 }
const limit = ref(PAGE[view.value])
watch([query, show, kind, sort, view], () => (limit.value = PAGE[view.value]))
const visible = computed(() => filtered.value.slice(0, limit.value))
const more = computed(() => filtered.value.length - visible.value.length)

const NEAR_PX = 600
const sentinel = useTemplateRef<HTMLElement>('sentinel')

/** Adds a page while the end of the list is near the viewport (checked after layout). */
async function fillIfNear() {
  await nextTick()
  const el = sentinel.value
  if (!el || more.value <= 0) return
  if (el.getBoundingClientRect().top < window.innerHeight + NEAR_PX) {
    limit.value += PAGE[view.value]
  }
}
useIntersectionObserver(
  sentinel,
  ([entry]) => {
    if (entry?.isIntersecting) void fillIfNear()
  },
  { rootMargin: `${NEAR_PX}px 0px` },
)
watch(limit, () => void fillIfNear())

function clearFilters() {
  query.value = ''
  show.value = 'owned'
  kind.value = 'all'
}

// ------------------------------------------------------------------ display

const showTabs = computed<SegmentedOption<Show>[]>(() => [
  {
    value: 'owned',
    label: 'Owned',
    title: 'Materials you hold',
    count: pools.value.owned.length,
  },
  {
    value: 'gained',
    label: 'Gained',
    title: `Gained ${props.hint}`,
    count: pools.value.gained.length,
    icon: ArrowUp,
    iconClass: 'text-success-text',
    disabled: !props.compared,
  },
  {
    value: 'spent',
    label: 'Spent',
    title: `Spent ${props.hint}`,
    count: pools.value.spent.length,
    icon: ArrowDown,
    iconClass: 'text-danger-text',
    disabled: !props.compared,
  },
])

/** The count shown: the hand-set one where the Planner has one. */
const countOf = (item: MaterialItem) => props.edited?.get(item.key) ?? item.count

function tileTitle(item: MaterialItem): string {
  const change = changeOf(item.key)
  const delta = change ? ` (${change > 0 ? '+' : '−'}${formatNumber(Math.abs(change))})` : ''
  const hand = props.edited?.get(item.key)
  const edit =
    hand === undefined
      ? ''
      : ` · set by hand ${formatNumber(hand)} (capture ${formatNumber(item.count)})`
  return `${item.name}: ${formatNumber(item.count)}${delta}${edit}`
}
const VIEW_OPTIONS: SegmentedOption<View>[] = [
  { value: 'grid', label: 'Icons', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: List },
]
const toneOf = (change: number) => (change > 0 ? 'text-success-text' : 'text-danger-text')
</script>

<template>
  <UiPanel flush>
    <template #header>
      <h2 class="text-base font-semibold">Bag</h2>
      <div class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="show" :options="showTabs" label="Show" compact />
        <UiSegmented v-model="view" :options="VIEW_OPTIONS" label="View" icon-only />
      </div>
    </template>

    <div class="flex flex-col gap-3 border-b border-border-default px-4 py-3 sm:px-5">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 basis-40">
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput
            v-model="query"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search"
            aria-label="Search materials"
            class="pl-9"
          />
        </div>
        <UiSelect
          v-if="show === 'owned'"
          v-model="sort"
          :options="SORT_OPTIONS"
          aria-label="Sort"
          title="Sort"
          class="w-32 sm:w-36"
        />
      </div>

      <div
        class="scroll-hide scroll-fade-x -mx-4 flex scroll-px-4 gap-2 overflow-x-auto px-4 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:px-0"
        role="radiogroup"
        aria-label="Kind"
      >
        <FilterChip
          v-for="chip in kindChips"
          :key="chip.id"
          radio
          :pressed="kind === chip.id"
          :count="chip.count"
          :title="chip.detail"
          @toggle="kind = chip.id"
        >
          <component :is="chip.icon" v-if="chip.icon" class="size-4" aria-hidden="true" />
          {{ chip.label }}
        </FilterChip>
      </div>
    </div>

    <div class="p-3 sm:p-5">
      <UiEmpty v-if="items.length === 0" title="No materials">
        <template #icon><Package aria-hidden="true" /></template>
        <UiButton variant="primary" :to="importTo">
          <Upload class="size-4" aria-hidden="true" />
          Import
        </UiButton>
      </UiEmpty>

      <UiEmpty v-else-if="filtered.length === 0" title="No matches">
        <template #icon><SearchX aria-hidden="true" /></template>
        <UiButton @click="clearFilters">Clear</UiButton>
      </UiEmpty>

      <template v-else>
        <!-- Icons: the in-game bag -->
        <ul
          v-if="view === 'grid'"
          class="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]"
        >
          <li v-for="item in visible" :key="item.key">
            <button
              type="button"
              class="group relative flex w-full flex-col overflow-hidden rounded-lg border border-border-default bg-surface-raised text-left shadow-sm transition hover:-translate-y-px hover:border-accent hover:shadow-md"
              :title="tileTitle(item)"
              :aria-label="tileTitle(item)"
              @click="open(item.key, $event)"
            >
              <span
                class="block aspect-square w-full bg-surface-overlay p-1 text-base sm:text-lg"
                :class="item.count === 0 ? 'opacity-40 grayscale' : ''"
              >
                <MaterialIcon :src="icon(item.key)" :name="item.name" />
              </span>
              <span
                class="tabular block truncate border-t border-border-default px-1 text-center font-mono text-xs leading-5 font-semibold"
                :class="edited?.has(item.key) ? 'text-accent-text' : ''"
                >{{ formatCompact(countOf(item)) }}</span
              >
              <span
                v-if="changeOf(item.key)"
                class="tabular absolute top-0.5 right-0.5 rounded bg-surface-raised/90 px-1 font-mono text-[0.6875rem] leading-4 font-semibold shadow-sm"
                :class="toneOf(changeOf(item.key))"
                aria-hidden="true"
                >{{ formatSigned(changeOf(item.key)) }}</span
              >
              <span
                v-if="trackedSet.has(item.key)"
                class="absolute top-1 left-1 size-2 rounded-full bg-accent ring-2 ring-surface-raised"
                title="Tracked"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>

        <!-- List: names, counts and changes -->
        <ul v-else class="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="item in visible" :key="item.key" class="min-w-0">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-overlay"
              :title="tileTitle(item)"
              @click="open(item.key, $event)"
            >
              <span
                class="relative size-10 shrink-0 rounded-lg bg-surface-overlay p-0.5 text-xs"
                :class="item.count === 0 ? 'opacity-40 grayscale' : ''"
              >
                <MaterialIcon :src="icon(item.key)" :name="item.name" />
                <span
                  v-if="trackedSet.has(item.key)"
                  class="absolute -top-0.5 -left-0.5 size-2 rounded-full bg-accent ring-2 ring-surface-raised"
                  aria-hidden="true"
                />
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">{{ item.name }}</span>
              <span class="flex shrink-0 flex-col items-end">
                <span
                  class="tabular font-mono text-sm font-semibold"
                  :class="edited?.has(item.key) ? 'text-accent-text' : ''"
                  >{{ formatNumber(countOf(item)) }}</span
                >
                <DeltaText :value="changeOf(item.key) || null" :hint="hint" class="text-xs" />
              </span>
            </button>
          </li>
        </ul>

        <div v-if="more > 0" ref="sentinel" class="mt-4 flex justify-center">
          <UiButton size="sm" @click="limit += PAGE[view]">
            {{ formatNumber(more) }} more
          </UiButton>
        </div>
      </template>
    </div>
  </UiPanel>
</template>
