<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SearchX, Swords, Upload } from 'lucide-vue-next'
import StatStrip, { type StripItem } from '@/components/characters/StatStrip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import ListPager from '@/components/weapons/ListPager.vue'
import WeaponDetail from '@/components/weapons/WeaponDetail.vue'
import WeaponGroupCard from '@/components/weapons/WeaponGroupCard.vue'
import WeaponTable from '@/components/weapons/WeaponTable.vue'
import WeaponToolbar from '@/components/weapons/WeaponToolbar.vue'
import { loadLatestInventory } from '@/data/account-data'
import { useResource } from '@/data/use-resource'
import {
  NO_WEAPON_FILTERS,
  WEAPON_SORTS,
  buildArmory,
  filterWeapons,
  groupWeapons,
  hasWeaponFilters,
  rarityBucket,
  sortGroups,
  sortWeapons,
  weaponFacetCounts,
  type SortDirection,
  type WeaponFilters,
  type WeaponSort,
} from '@/data/weapons'
import { readJson, writeJson } from '@/lib/storage'
import { useAccount } from './context'

const GRID_PAGE = 120
const LIST_PAGE = 100

const account = useAccount()
const inventory = useResource(
  () => account.value,
  (a) => loadLatestInventory(a),
)

const armory = computed(() =>
  inventory.data.value ? buildArmory(inventory.data.value.good) : null,
)

// ------------------------------------------------------------ toolbar state

const filters = reactive<WeaponFilters>({ ...NO_WEAPON_FILTERS })
const filtered = computed(() => hasWeaponFilters(filters))

const saved = readJson<{ sort?: string; direction?: string; view?: string }>('weapons:sort', {})
const sort = ref<WeaponSort>(
  WEAPON_SORTS.some((s) => s.value === saved.sort) ? (saved.sort as WeaponSort) : 'rarity',
)
const direction = ref<SortDirection>(saved.direction === 'asc' ? 'asc' : 'desc')
const view = ref<'grid' | 'list'>(saved.view === 'list' ? 'list' : 'grid')
watch([sort, direction, view], () =>
  writeJson('weapons:sort', { sort: sort.value, direction: direction.value, view: view.value }),
)

const rows = computed(() => armory.value?.rows ?? [])
const refine = computed(() => armory.value?.refine ?? new Map())
const matched = computed(() => filterWeapons(rows.value, filters, refine.value))
const matchedCopies = computed(() => matched.value.reduce((sum, r) => sum + r.count, 0))
const groups = computed(() =>
  sortGroups(groupWeapons(matched.value, refine.value), sort.value, direction.value),
)
const sortedRows = computed(() => sortWeapons(matched.value, sort.value, direction.value))

const typeCounts = computed(() =>
  weaponFacetCounts(rows.value, filters, refine.value, 'type', (r) => r.type),
)
const rarityCounts = computed(() =>
  weaponFacetCounts(rows.value, filters, refine.value, 'rarity', (r) => rarityBucket(r.rarity)),
)

const strip = computed<StripItem[]>(() => {
  const a = armory.value
  if (!a) return []
  const spare5 = filters.status === 'unequipped' && filters.rarity === 5
  return [
    { key: 'total', label: 'Weapons', value: a.total },
    { key: 'kinds', label: 'Kinds', value: a.kinds, title: 'Different weapons' },
    { key: 'equipped', label: 'Equipped', value: a.equipped },
    { key: 'five', label: '5★', value: a.byRarity.get(5) ?? 0 },
    { key: 'spare5', label: 'Unused 5★', value: a.spare5, pressed: spare5 },
    {
      key: 'refinable',
      label: 'Refinable',
      value: a.refine.size,
      title: 'Spare copies could refine an equipped one',
      pressed: filters.refinable,
    },
  ]
})

function toggleStrip(key: string) {
  if (key === 'refinable') filters.refinable = !filters.refinable
  if (key === 'spare5') {
    const on = filters.status === 'unequipped' && filters.rarity === 5
    filters.status = on ? 'all' : 'unequipped'
    filters.rarity = on ? 'all' : 5
  }
}

function clearFilters() {
  Object.assign(filters, NO_WEAPON_FILTERS)
}

// ------------------------------------------------------------------ paging

const page = ref(1)
const pageSize = computed(() => (view.value === 'grid' ? GRID_PAGE : LIST_PAGE))
const itemCount = computed(() =>
  view.value === 'grid' ? groups.value.length : sortedRows.value.length,
)
const pageGroups = computed(() =>
  groups.value.slice((page.value - 1) * GRID_PAGE, page.value * GRID_PAGE),
)
const pageRows = computed(() =>
  sortedRows.value.slice((page.value - 1) * LIST_PAGE, page.value * LIST_PAGE),
)
watch([filters, sort, direction, view, armory], () => (page.value = 1))

const listTop = ref<HTMLElement>()
watch(page, () => {
  if (listTop.value && listTop.value.getBoundingClientRect().top < 0) {
    listTop.value.scrollIntoView({ block: 'start' })
  }
})

// ------------------------------------------------------------------ details
// The open weapon lives in the URL (?w=Key): links work, and Back closes it.

const route = useRoute()
const router = useRouter()
const selectedKey = computed(() => (typeof route.query.w === 'string' ? route.query.w : null))
/** Every copy of the weapon, whatever the filters. */
const selected = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return (
    groupWeapons(
      rows.value.filter((r) => r.key === key),
      refine.value,
    )[0] ?? null
  )
})
let pushed = false
watch(selectedKey, (key) => {
  if (key === null) pushed = false
})

function open(key: string) {
  const query = { ...route.query, w: key }
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
  delete query.w
  void router.replace({ query })
}
</script>

<template>
  <div>
    <PageHeader title="Weapons" />

    <UiError
      v-if="inventory.error.value"
      class="mb-6"
      :error="inventory.error.value"
      title="Load failed"
      @retry="inventory.reload"
    />

    <div v-if="!armory && inventory.loading.value" aria-busy="true" aria-label="Loading">
      <div class="mb-4 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-6">
        <UiSkeleton v-for="n in 6" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <UiSkeleton class="mb-4 h-40 w-full sm:h-36" />
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="n in 12"
          :key="n"
          class="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
        >
          <UiSkeleton class="size-12" />
          <div class="flex flex-1 flex-col gap-2">
            <UiSkeleton class="h-5 w-36" />
            <UiSkeleton class="h-3 w-20" />
            <UiSkeleton class="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>

    <UiEmpty
      v-else-if="inventory.data.value === null || (armory && armory.total === 0)"
      title="No weapons"
    >
      <template #icon><Swords aria-hidden="true" /></template>
      <UiButton variant="primary" :to="{ name: 'account-import' }">
        <Upload class="size-5" aria-hidden="true" />
        Import
      </UiButton>
    </UiEmpty>

    <template v-else-if="armory">
      <StatStrip class="mb-4" :items="strip" @toggle="toggleStrip" />

      <WeaponToolbar
        v-model:filters="filters"
        v-model:sort="sort"
        v-model:direction="direction"
        v-model:view="view"
        class="mb-4"
        :type-counts="typeCounts"
        :rarity-counts="rarityCounts"
        :refinable-count="armory.refine.size"
        :shown="matchedCopies"
        :total="armory.total"
        :filtered="filtered"
        @clear="clearFilters"
      />

      <UiEmpty v-if="matched.length === 0" title="No matches">
        <template #icon><SearchX aria-hidden="true" /></template>
        <UiButton @click="clearFilters">Clear</UiButton>
      </UiEmpty>

      <template v-else>
        <div ref="listTop" class="scroll-mt-20">
          <ul
            v-if="view === 'grid'"
            class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Weapons"
          >
            <li v-for="group in pageGroups" :key="group.key" class="flex">
              <WeaponGroupCard :group="group" @open="open(group.key)" />
            </li>
          </ul>
          <WeaponTable
            v-else
            v-model:sort="sort"
            v-model:direction="direction"
            :rows="pageRows"
            @open="open"
          />
        </div>
        <ListPager
          v-model="page"
          class="mt-4"
          :total="itemCount"
          :page-size="pageSize"
          label="Weapon pages"
        />
      </template>
    </template>

    <UiModal :open="selected !== null" :title="selected?.name ?? ''" @close="close">
      <WeaponDetail v-if="selected" :group="selected" :account-id="account.id" />
    </UiModal>
  </div>
</template>
