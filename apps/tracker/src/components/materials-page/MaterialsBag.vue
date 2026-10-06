<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { useIntersectionObserver } from '@vueuse/core'
import type { BagTabInfo } from '@gdt/game-data/bag'
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
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { materialMatcher, matchRank } from '@/utils/materials'
import DeltaText from './DeltaText.vue'
import MaterialIcon from './MaterialIcon.vue'
import MaterialTile from './MaterialTile.vue'
import { tabDisplay } from './bag-tabs'
import type { MaterialItem } from './material-items'
import { compareInGame, tabsHolding, type TabKey } from './material-meta'

/**
 * The bag, as the in-game Inventory shows it: an All tab, then the game's
 * tabs that hold something (Weapons for enhancement ores, Artifacts for
 * Sanctifying items, Character Development Items, Food, Materials…, Other
 * for what the Inventory doesn't show), each in the game's order by default.
 * Tiles like the game's (or a named list), filtered by what moved and by
 * name. Renders in pages as it scrolls, so 1,400 materials cost what 150 do.
 */
const props = defineProps<{
  /** Every material held in any snapshot. */
  items: MaterialItem[]
  /** The Inventory's tabs, left to right (from the game data). */
  tabs: readonly BagTabInfo[]
  changes: Map<string, number>
  /** False when there is nothing to compare with (a single snapshot). */
  compared: boolean
  /** Tooltip end for the changes ("since Jul 12, 2026"). */
  hint: string
  tracked: string[]
  icon: (key: string) => string
  /** A tile's backdrop rarity; null where the data has none. */
  rarity: (key: string) => number | null
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
type Tab = TabKey | 'all'

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'order', label: 'In-game' },
  { value: 'count', label: 'Count' },
  { value: 'change', label: 'Change' },
  { value: 'name', label: 'Name' },
]
const SORT_KEY = 'materials:sort'
const VIEW_KEY = 'materials:view'
const TAB_KEY = 'materials:tab'

const storedSort = readStorage(SORT_KEY)
const sort = ref<Sort>(
  SORT_OPTIONS.some((o) => o.value === storedSort) ? (storedSort as Sort) : 'order',
)
watch(sort, (value) => writeStorage(SORT_KEY, value))
const view = ref<View>(readStorage(VIEW_KEY) === 'list' ? 'list' : 'grid')
watch(view, (value) => writeStorage(VIEW_KEY, value))
/** The chosen tab; one this account has nothing in shows All (and stays chosen). */
const tab = ref<Tab>((readStorage(TAB_KEY) as Tab | null) ?? 'all')
function pickTab(value: Tab) {
  tab.value = value
  writeStorage(TAB_KEY, value)
}

// On phones the tab row scrolls sideways: bring a remembered tab's chip into it.
const tabRow = useTemplateRef<HTMLElement>('tabRow')
onMounted(async () => {
  await nextTick()
  const row = tabRow.value
  const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]')
  if (!row || !chip) return
  const box = row.getBoundingClientRect()
  const at = chip.getBoundingClientRect()
  if (at.left < box.left || at.right > box.right) row.scrollLeft += at.left - box.left - 16
})

const query = ref('')
const show = ref<Show>('owned')

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

/** Owned, gained or spent: the pool before the name and tab filters. */
const pools = computed(() => {
  const owned: MaterialItem[] = []
  const gained: MaterialItem[] = []
  const spent: MaterialItem[] = []
  for (const item of props.items) {
    if (item.count > 0) owned.push(item)
    const change = props.changes.get(item.key) ?? 0
    if (change > 0) gained.push(item)
    else if (change < 0) spent.push(item)
  }
  return { owned, gained, spent }
})

/** After the name search, which also finds materials now at 0. */
const searched = computed(() => {
  const match = materialMatcher(query.value)
  if (!match) return pools.value[show.value]
  const pool =
    show.value === 'owned'
      ? props.items
      : props.items.filter((item) => (show.value === 'gained' ? 1 : -1) * changeOf(item.key) > 0)
  return pool.filter((item) => match(item.name) || match(item.key))
})

/** Tabs that hold anything this account ever had, in the game's order (Other last). */
const tabKeys = computed(() => tabsHolding(props.tabs, props.items))
const activeTab = computed<Tab>(() =>
  tab.value !== 'all' && tabKeys.value.includes(tab.value) ? tab.value : 'all',
)

const tabCounts = computed(() => {
  const counts = new Map<TabKey, number>()
  for (const item of searched.value) counts.set(item.tab, (counts.get(item.tab) ?? 0) + 1)
  return counts
})

const tabChips = computed(() => [
  { key: 'all' as Tab, label: 'All', title: 'Every tab', icon: null, count: searched.value.length },
  ...tabKeys.value.map((key) => {
    const display = tabDisplay(key)
    return {
      key: key as Tab,
      label: display.label,
      title: display.title,
      icon: display.icon,
      count: tabCounts.value.get(key) ?? 0,
    }
  }),
])

/** Gained and spent always list the biggest moves first. */
const sortBy = computed<Sort>(() => (show.value === 'owned' ? sort.value : 'change'))

const filtered = computed(() => {
  const list =
    activeTab.value === 'all'
      ? searched.value
      : searched.value.filter((i) => i.tab === activeTab.value)
  const q = query.value.trim()
  const by = sortBy.value
  const compare = (a: MaterialItem, b: MaterialItem): number => {
    if (by === 'count') return b.count - a.count
    if (by === 'change') return Math.abs(changeOf(b.key)) - Math.abs(changeOf(a.key))
    if (by === 'name') return a.name.localeCompare(b.name)
    return 0
  }
  return [...list].sort(
    (a, b) =>
      (q ? matchRank(a.name, q) - matchRank(b.name, q) : 0) || compare(a, b) || compareInGame(a, b),
  )
})

// ------------------------------------------------------------------ paging

const PAGE = { grid: 168, list: 90 }
const limit = ref(PAGE[view.value])
watch([query, show, activeTab, sort, view], () => (limit.value = PAGE[view.value]))
const visible = computed(() => filtered.value.slice(0, limit.value))
const more = computed(() => filtered.value.length - visible.value.length)

/**
 * All, in the game's order: a heading per tab, as the game's tabs follow
 * one another. Any other sort, a search or one tab: one run.
 */
const sections = computed(() => {
  const grouped = activeTab.value === 'all' && sortBy.value === 'order' && !query.value.trim()
  if (!grouped) return [{ id: 'all', tab: null, items: visible.value }]
  const out: { id: string; tab: TabKey | null; items: MaterialItem[] }[] = []
  for (const item of visible.value) {
    const last = out[out.length - 1]
    if (last?.tab === item.tab) last.items.push(item)
    else out.push({ id: item.tab, tab: item.tab, items: [item] })
  }
  return out
})

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
  pickTab('all')
}

// ------------------------------------------------------------------ display

const heading = computed(() =>
  activeTab.value === 'all' ? null : tabDisplay(activeTab.value as TabKey),
)

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
</script>

<template>
  <UiPanel flush>
    <template #header>
      <h2 class="flex min-w-0 items-center gap-2 text-base font-semibold">
        <template v-if="heading">
          <component
            :is="heading.icon"
            class="size-4 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <span class="truncate" :title="heading.title">{{ heading.name }}</span>
        </template>
        <template v-else>Bag</template>
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="show" :options="showTabs" label="Show" compact />
        <UiSegmented v-model="view" :options="VIEW_OPTIONS" label="View" icon-only />
      </div>
    </template>

    <div class="flex flex-col gap-3 border-b border-border-default px-4 py-3 sm:px-5">
      <div
        ref="tabRow"
        class="scroll-hide scroll-fade-x -mx-4 flex scroll-px-4 gap-2 overflow-x-auto px-4 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:px-0"
        role="radiogroup"
        aria-label="Inventory tab"
      >
        <FilterChip
          v-for="chip in tabChips"
          :key="chip.key"
          radio
          :pressed="activeTab === chip.key"
          :count="chip.count"
          :title="chip.title"
          @toggle="pickTab(chip.key)"
        >
          <component :is="chip.icon" v-if="chip.icon" class="size-4" aria-hidden="true" />
          {{ chip.label }}
        </FilterChip>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 basis-32">
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

      <div v-else class="flex flex-col gap-5">
        <section
          v-for="section in sections"
          :key="section.id"
          :aria-label="section.tab ? tabDisplay(section.tab).name : undefined"
        >
          <h3
            v-if="section.tab"
            class="mb-2 flex items-center gap-2 text-sm font-medium"
            :title="tabDisplay(section.tab).title"
          >
            <component
              :is="tabDisplay(section.tab).icon"
              class="size-4 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <span class="truncate">{{ tabDisplay(section.tab).name }}</span>
            <span class="tabular font-mono text-text-muted">{{
              formatNumber(tabCounts.get(section.tab) ?? 0)
            }}</span>
            <span class="h-px min-w-4 flex-1 bg-border-default" aria-hidden="true" />
          </h3>

          <!-- Icons: the in-game bag -->
          <ul
            v-if="view === 'grid'"
            class="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] sm:gap-2"
          >
            <li v-for="item in section.items" :key="item.key" class="flex">
              <MaterialTile
                :name="item.name"
                :src="icon(item.key)"
                :rarity="rarity(item.key)"
                :count="countOf(item)"
                :change="changeOf(item.key)"
                :tracked="trackedSet.has(item.key)"
                :edited="edited?.has(item.key) ?? false"
                :label="tileTitle(item)"
                @open="open(item.key, $event)"
              />
            </li>
          </ul>

          <!-- List: names, counts and changes -->
          <ul v-else class="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            <li v-for="item in section.items" :key="item.key" class="min-w-0">
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
        </section>

        <div v-if="more > 0" ref="sentinel" class="flex justify-center">
          <UiButton size="sm" @click="limit += PAGE[view]">
            {{ formatNumber(more) }} more
          </UiButton>
        </div>
      </div>
    </div>
  </UiPanel>
</template>
