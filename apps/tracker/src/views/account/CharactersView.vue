<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useRoute, useRouter } from 'vue-router'
import { SearchX, Upload, Users } from 'lucide-vue-next'
import CharacterCard from '@/components/characters/CharacterCard.vue'
import { preloadCharacter } from '@/components/characters/card-images'
import CharacterTable from '@/components/characters/CharacterTable.vue'
import CharacterToolbar from '@/components/characters/CharacterToolbar.vue'
import { useProgressive } from '@/components/planner/use-progressive'
import StatStrip, { type StripItem } from '@/components/characters/StatStrip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SavedTeams from '@/components/characters/SavedTeams.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadLatestInventory } from '@/data/account-data'
import {
  CHARACTER_SORTS,
  NO_CHARACTER_FILTERS,
  buildRoster,
  characterSorts,
  facetCounts,
  filterCharacters,
  hasCharacterFilters,
  sortCharacters,
  type CharacterFilters,
  type CharacterSort,
  type SortDirection,
} from '@/data/characters'
import { useFavoriteCharacters } from '@/data/favorite-characters'
import { useResource } from '@/data/use-resource'
import { readJson, writeJson } from '@/lib/storage'
import { useAccount, useReadOnly } from './context'

// The details (also the share card) carry the game's stat tables: loaded on first open.
const CharacterModal = defineAsyncComponent(
  () => import('@/components/characters/CharacterModal.vue'),
)
const RosterShareModal = defineAsyncComponent(
  () => import('@/components/characters/RosterShareModal.vue'),
)

const account = useAccount()
/** Staff Inspect: nothing here links to the owner's own pages. */
const readOnly = useReadOnly()
const inventory = useResource(
  () => account.value,
  (a) => loadLatestInventory(a),
)

const roster = computed(() =>
  inventory.data.value ? buildRoster(inventory.data.value.good) : null,
)

// ------------------------------------------------------------ toolbar state

const filters = reactive<CharacterFilters>({ ...NO_CHARACTER_FILTERS })
const filtered = computed(() => hasCharacterFilters(filters))

/**
 * The sort and view, per device. `v: 2` came with the Default sort (the
 * game's order): a sort saved before it starts on Default once.
 */
const saved = readJson<{ sort?: string; direction?: string; view?: string; v?: number }>(
  'characters:sort',
  {},
)
const savedSort = saved.v === 2 ? saved : {}
const sort = ref<CharacterSort>(
  CHARACTER_SORTS.some((s) => s.value === savedSort.sort)
    ? (savedSort.sort as CharacterSort)
    : 'default',
)
const direction = ref<SortDirection>(savedSort.direction === 'asc' ? 'asc' : 'desc')
const view = ref<'grid' | 'list'>(saved.view === 'list' ? 'list' : 'grid')
watch([sort, direction, view], () =>
  writeJson('characters:sort', {
    sort: sort.value,
    direction: direction.value,
    view: view.value,
    v: 2,
  }),
)

/** Friendship and obtained date only when this roster knows them. */
const sorts = computed(() => (roster.value ? characterSorts(roster.value) : CHARACTER_SORTS))
watch(
  sorts,
  (list) => {
    if (roster.value && !list.some((s) => s.value === sort.value)) sort.value = 'default'
  },
  { immediate: true },
)

// Favourites come first under every sort (and filter like the rest).
const { favorites, toggle: toggleFavorite } = useFavoriteCharacters(() => account.value.id)

const all = computed(() => roster.value?.characters ?? [])
const shown = computed(() =>
  sortCharacters(
    filterCharacters(all.value, filters, undefined, favorites.value),
    sort.value,
    direction.value,
    favorites.value,
  ),
)
/** Cards whose pictures load first: what a wide screen shows before scrolling. */
const FIRST_SCREEN = 12

// The roster mounts a screenful first and the rest over the next frames:
// ~120 cards at once froze a phone for most of a second.
const { shown: mounted, restart: restartRoster } = useProgressive(
  computed(() => shown.value.length),
  12,
  12,
)
watch(view, restartRoster)
const visible = computed(() =>
  mounted.value >= shown.value.length ? shown.value : shown.value.slice(0, mounted.value),
)
const elementCounts = computed(() =>
  facetCounts(all.value, filters, 'element', (c) => c.element, favorites.value),
)
const rarityCounts = computed(() =>
  facetCounts(all.value, filters, 'rarity', (c) => c.rarity, favorites.value),
)
/** Favourites the other filters keep; the chip hides until there is one. */
const favoriteCount = computed(() =>
  favorites.value.size === 0 && !filters.favorites
    ? null
    : filterCharacters(all.value, { ...filters, favorites: true }, undefined, favorites.value)
        .length,
)

const strip = computed<StripItem[]>(() => {
  const r = roster.value
  if (!r) return []
  return [
    { key: 'total', label: t('game.characters'), value: r.total },
    { key: 'c6', label: t('characters.page.c6'), value: r.c6 },
    { key: 'level90', label: t('characters.page.level90'), value: r.level90 },
    {
      key: 'crowns',
      label: t('characters.page.crowns'),
      value: r.crowns,
      title: t('characters.page.crownsTitle'),
    },
    {
      key: 'ready',
      label: t('characters.build.ready'),
      value: r.ready,
      title: t('characters.toolbar.buildTitle'),
      pressed: filters.build === 'ready',
    },
    {
      key: 'needs',
      label: t('characters.build.needs'),
      value: r.total - r.ready,
      pressed: filters.build === 'needs',
      tone: 'warning',
    },
  ]
})

function toggleStrip(key: string) {
  if (key !== 'ready' && key !== 'needs') return
  filters.build = filters.build === key ? 'all' : key
}

function clearFilters() {
  Object.assign(filters, NO_CHARACTER_FILTERS)
}

// ------------------------------------------------------------------ details
// The open character lives in the URL (?c=Key): links work, and Back closes it.

const route = useRoute()
const router = useRouter()
const selectedKey = computed(() => (typeof route.query.c === 'string' ? route.query.c : null))
const selected = computed(() => all.value.find((c) => c.key === selectedKey.value) ?? null)
let pushed = false
watch(selectedKey, (key) => {
  if (key === null) pushed = false
})

function open(key: string) {
  const query = { ...route.query, c: key }
  if (selectedKey.value !== null) {
    void router.replace({ query })
  } else {
    pushed = true
    void router.push({ query })
  }
}

function close() {
  if (pushed) {
    pushed = false
    router.back()
    return
  }
  const query = { ...route.query }
  delete query.c
  void router.replace({ query })
}

/** Steps through the list as filtered and sorted (or the whole roster if it is not in it). */
const stepList = computed(() =>
  selected.value && shown.value.some((c) => c.key === selected.value!.key)
    ? shown.value
    : all.value,
)
const selectedIndex = computed(() =>
  selected.value ? stepList.value.findIndex((c) => c.key === selected.value!.key) : -1,
)
function step(delta: -1 | 1) {
  const list = stepList.value
  if (list.length < 2 || selectedIndex.value < 0) return
  const next = list[(selectedIndex.value + delta + list.length) % list.length]
  if (next) open(next.key)
}

// Mounted from the first open on, so closing it hands focus back like any dialog.
const detailsUsed = ref(false)
watch(
  selected,
  (character) => {
    if (character) detailsUsed.value = true
  },
  { immediate: true },
)
const player = computed(() => inventory.data.value?.good.gi_player ?? null)

/** The roster share card (the list as filtered and sorted); mounted from its first open. */
const rosterOpen = ref(false)
const rosterUsed = ref(false)
function openRoster() {
  rosterUsed.value = true
  rosterOpen.value = true
}

// Fetch and decode the open character's card images first, then both
// neighbours' (after, so they don't slow the open one down), so stepping shows
// the next one at once. Bounded: lib/image-preload keeps a few characters.
let preloadRun = 0
watch(
  selectedIndex,
  async (index) => {
    const run = ++preloadRun
    const list = stepList.value
    if (index < 0) return
    await preloadCharacter(list[index])
    if (run !== preloadRun || list.length < 2) return
    void preloadCharacter(list[(index + 1) % list.length])
    void preloadCharacter(list[(index - 1 + list.length) % list.length])
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <PageHeader :title="$t('game.characters')" />

    <UiError
      v-if="inventory.error.value"
      class="mb-6"
      :error="inventory.error.value"
      :title="$t('characters.detail.loadFailed')"
      @retry="inventory.reload"
    />

    <div
      v-if="!roster && inventory.loading.value"
      aria-busy="true"
      :aria-label="$t('characters.page.loading')"
    >
      <div class="mb-4 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        <UiSkeleton v-for="n in 6" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <UiSkeleton class="mb-4 h-40 w-full sm:h-36" />
      <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-3">
        <div
          v-for="n in 9"
          :key="n"
          class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
        >
          <div class="flex items-center gap-3">
            <UiSkeleton class="size-16" />
            <div class="flex flex-1 flex-col gap-2">
              <UiSkeleton class="h-5 w-32" />
              <UiSkeleton class="h-4 w-full" />
              <UiSkeleton class="h-5 w-24" />
            </div>
          </div>
          <UiSkeleton class="h-7 w-full" />
        </div>
      </div>
    </div>

    <UiPanel v-else-if="inventory.data.value === null || (roster && roster.total === 0)" flush>
      <UiEmpty
        :title="
          inventory.data.value === null
            ? $t('characters.page.noSnapshots')
            : $t('characters.page.empty')
        "
      >
        <template #icon><Users aria-hidden="true" /></template>
        <UiButton v-if="!readOnly" variant="primary" :to="{ name: 'account-import' }">
          <Upload class="size-4" aria-hidden="true" />
          {{ $t('characters.page.import') }}
        </UiButton>
      </UiEmpty>
    </UiPanel>

    <template v-else-if="roster">
      <StatStrip class="mb-4" :items="strip" @toggle="toggleStrip" />

      <CharacterToolbar
        v-model:filters="filters"
        v-model:sort="sort"
        v-model:direction="direction"
        v-model:view="view"
        class="mb-4"
        :sorts="sorts"
        :element-counts="elementCounts"
        :rarity-counts="rarityCounts"
        :favorite-count="favoriteCount"
        :shown="shown.length"
        :total="roster.total"
        :filtered="filtered"
        @clear="clearFilters"
        @share="openRoster"
      />

      <UiPanel v-if="shown.length === 0" flush>
        <UiEmpty :title="$t('characters.page.noMatches')">
          <template #icon><SearchX aria-hidden="true" /></template>
          <UiButton @click="clearFilters">{{ $t('characters.toolbar.clear') }}</UiButton>
        </UiEmpty>
      </UiPanel>

      <ul
        v-else-if="view === 'grid'"
        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] gap-3"
        :aria-label="$t('game.characters')"
      >
        <!-- content-visibility: cards off screen skip layout and paint, so each
             chunk of the roster lays out only what shows. It clips paint to the
             box: the padding (undone by the margin) keeps the focus ring and
             shadow inside it. -->
        <li
          v-for="(c, i) in visible"
          :key="c.key"
          class="-m-1 flex p-1 [contain-intrinsic-size:auto_11rem] [content-visibility:auto]"
          @pointerenter="void preloadCharacter(c)"
          @focusin="void preloadCharacter(c)"
        >
          <CharacterCard
            :character="c"
            :priority="i < FIRST_SCREEN ? 'high' : 'low'"
            :favorite="favorites.has(c.key)"
            @open="open(c.key)"
            @favorite="toggleFavorite(c.key)"
          />
        </li>
      </ul>

      <CharacterTable
        v-else
        v-model:sort="sort"
        v-model:direction="direction"
        :characters="visible"
        :friendship="roster.hasFriendship"
        :favorites="favorites"
        @open="open"
        @favorite="toggleFavorite"
      />

      <SavedTeams class="mt-6" />
    </template>

    <CharacterModal
      v-if="detailsUsed"
      :character="selected"
      :account="account"
      :player-uid="player?.uid ?? null"
      :ar="player?.ar ?? null"
      :index="selectedIndex >= 0 ? selectedIndex : undefined"
      :total="stepList.length"
      @close="close"
      @step="step"
    />
    <RosterShareModal
      v-if="rosterUsed"
      :open="rosterOpen"
      :characters="shown"
      :account="account"
      :player-uid="player?.uid ?? null"
      :ar="player?.ar ?? null"
      @close="rosterOpen = false"
    />
  </div>
</template>
