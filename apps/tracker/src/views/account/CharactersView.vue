<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SearchX, Upload, Users } from 'lucide-vue-next'
import CharacterCard from '@/components/characters/CharacterCard.vue'
import CharacterDetail from '@/components/characters/CharacterDetail.vue'
import CharacterTable from '@/components/characters/CharacterTable.vue'
import CharacterToolbar from '@/components/characters/CharacterToolbar.vue'
import StatStrip, { type StripItem } from '@/components/characters/StatStrip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiModal from '@/components/ui/UiModal.vue'
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
import { useResource } from '@/data/use-resource'
import { readJson, writeJson } from '@/lib/storage'
import { useAccount } from './context'

const account = useAccount()
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

const saved = readJson<{ sort?: string; direction?: string; view?: string }>('characters:sort', {})
const sort = ref<CharacterSort>(
  CHARACTER_SORTS.some((s) => s.value === saved.sort) ? (saved.sort as CharacterSort) : 'level',
)
const direction = ref<SortDirection>(saved.direction === 'asc' ? 'asc' : 'desc')
const view = ref<'grid' | 'list'>(saved.view === 'list' ? 'list' : 'grid')
watch([sort, direction, view], () =>
  writeJson('characters:sort', { sort: sort.value, direction: direction.value, view: view.value }),
)

/** Friendship and obtained date only when this roster knows them. */
const sorts = computed(() => (roster.value ? characterSorts(roster.value) : CHARACTER_SORTS))
watch(
  sorts,
  (list) => {
    if (roster.value && !list.some((s) => s.value === sort.value)) sort.value = 'level'
  },
  { immediate: true },
)

const all = computed(() => roster.value?.characters ?? [])
const shown = computed(() =>
  sortCharacters(filterCharacters(all.value, filters), sort.value, direction.value),
)
const elementCounts = computed(() => facetCounts(all.value, filters, 'element', (c) => c.element))
const rarityCounts = computed(() => facetCounts(all.value, filters, 'rarity', (c) => c.rarity))

const strip = computed<StripItem[]>(() => {
  const r = roster.value
  if (!r) return []
  return [
    { key: 'total', label: 'Characters', value: r.total },
    { key: 'c6', label: 'C6', value: r.c6 },
    { key: 'level90', label: 'Lv 90+', value: r.level90 },
    { key: 'crowns', label: 'Crowns', value: r.crowns, title: 'Talents at level 10' },
    {
      key: 'ready',
      label: 'Ready',
      value: r.ready,
      title: 'Lv 90, weapon Lv 90, five maxed artifacts, a full set bonus',
      pressed: filters.build === 'ready',
    },
    {
      key: 'needs',
      label: 'Needs work',
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
</script>

<template>
  <div>
    <PageHeader title="Characters" />

    <UiError
      v-if="inventory.error.value"
      class="mb-6"
      :error="inventory.error.value"
      title="Load failed"
      @retry="inventory.reload"
    />

    <div v-if="!roster && inventory.loading.value" aria-busy="true" aria-label="Loading">
      <div class="mb-4 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        <UiSkeleton v-for="n in 6" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <UiSkeleton class="mb-4 h-40 w-full sm:h-36" />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
      <UiEmpty :title="inventory.data.value === null ? 'No snapshots yet' : 'No characters'">
        <template #icon><Users aria-hidden="true" /></template>
        <UiButton variant="primary" :to="{ name: 'account-import' }">
          <Upload class="size-4" aria-hidden="true" />
          Import
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
        :shown="shown.length"
        :total="roster.total"
        :filtered="filtered"
        @clear="clearFilters"
      />

      <UiPanel v-if="shown.length === 0" flush>
        <UiEmpty title="No matches">
          <template #icon><SearchX aria-hidden="true" /></template>
          <UiButton @click="clearFilters">Clear</UiButton>
        </UiEmpty>
      </UiPanel>

      <ul
        v-else-if="view === 'grid'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Characters"
      >
        <li v-for="c in shown" :key="c.key" class="flex">
          <CharacterCard :character="c" @open="open(c.key)" />
        </li>
      </ul>

      <CharacterTable
        v-else
        v-model:sort="sort"
        v-model:direction="direction"
        :characters="shown"
        :friendship="roster.hasFriendship"
        @open="open"
      />
    </template>

    <UiModal
      :open="selected !== null"
      :title="selected?.name ?? ''"
      size="detail"
      :index="selectedIndex >= 0 ? selectedIndex : undefined"
      :total="stepList.length"
      loop
      @close="close"
      @step="step"
    >
      <CharacterDetail v-if="selected" :character="selected" :account="account" />
    </UiModal>
  </div>
</template>
