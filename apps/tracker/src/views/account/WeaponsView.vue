<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Search, SearchX, Swords, Upload } from 'lucide-vue-next'
import SortControl from '@/components/characters/SortControl.vue'
import ToggleChip from '@/components/characters/ToggleChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import ListPager from '@/components/weapons/ListPager.vue'
import WeaponCard from '@/components/weapons/WeaponCard.vue'
import { loadLatestInventory } from '@/data/account-data'
import { useResource } from '@/data/use-resource'
import {
  NO_WEAPON_FILTERS,
  WEAPON_SORTS,
  WEAPON_TYPES,
  WEAPON_TYPE_LABELS,
  buildArmory,
  filterWeapons,
  hasWeaponFilters,
  sortWeapons,
  type SortDirection,
  type WeaponFilters,
  type WeaponSort,
} from '@/data/weapons'
import { formatNumber } from '@/lib/format'
import { readJson, writeJson } from '@/lib/storage'
import { useAccount } from './context'

const PAGE_SIZE = 96

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

const saved = readJson<{ sort?: string; direction?: string }>('weapons:sort', {})
const sort = ref<WeaponSort>(
  WEAPON_SORTS.some((s) => s.value === saved.sort) ? (saved.sort as WeaponSort) : 'level',
)
const direction = ref<SortDirection>(saved.direction === 'asc' ? 'asc' : 'desc')
watch([sort, direction], () =>
  writeJson('weapons:sort', { sort: sort.value, direction: direction.value }),
)

const statusOptions = [
  { value: 'all' as const, label: 'Status' },
  { value: 'equipped' as const, label: 'Equipped' },
  { value: 'unequipped' as const, label: 'Unequipped' },
]
const lockOptions = [
  { value: 'all' as const, label: 'Lock' },
  { value: 'locked' as const, label: 'Locked' },
  { value: 'unlocked' as const, label: 'Unlocked' },
]
const rarityOptions = [
  { value: 'all' as const, label: 'Rarity' },
  { value: 5 as const, label: '5★' },
  { value: 4 as const, label: '4★' },
  { value: 3 as const, label: '3★' },
  { value: 'low' as const, label: '1–2★' },
]
const typeOptions = [
  { value: 'all' as const, label: 'Type' },
  ...WEAPON_TYPES.map((w) => ({ value: w, label: WEAPON_TYPE_LABELS[w] })),
]

const shown = computed(() =>
  armory.value
    ? sortWeapons(filterWeapons(armory.value.rows, filters), sort.value, direction.value)
    : [],
)
const shownCopies = computed(() => shown.value.reduce((sum, r) => sum + r.count, 0))

const page = ref(1)
const pageRows = computed(() =>
  shown.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([filters, sort, direction, armory], () => (page.value = 1))

const listTop = ref<HTMLElement>()
watch(page, () => {
  if (listTop.value && listTop.value.getBoundingClientRect().top < 0) {
    listTop.value.scrollIntoView({ block: 'start' })
  }
})

function clearFilters() {
  Object.assign(filters, NO_WEAPON_FILTERS)
}
</script>

<template>
  <div>
    <PageHeader title="Weapons">
      <template #meta>
        <UiSkeleton v-if="!armory && inventory.loading.value" class="mt-2 h-5 w-56 max-w-full" />
        <p v-else-if="armory" class="mt-1 flex flex-wrap gap-x-4 text-text-secondary">
          <span
            ><span class="tabular font-mono text-text-primary">{{
              formatNumber(armory.total)
            }}</span>
            total</span
          >
          <span title="Identical unequipped copies stacked"
            ><span class="tabular font-mono text-text-primary">{{
              formatNumber(armory.distinct)
            }}</span>
            distinct</span
          >
          <span
            ><span class="tabular font-mono text-text-primary">{{
              formatNumber(armory.equipped)
            }}</span>
            equipped</span
          >
        </p>
      </template>
    </PageHeader>

    <UiError
      v-if="inventory.error.value"
      class="mb-6"
      :error="inventory.error.value"
      title="Load failed"
      @retry="inventory.reload"
    />

    <div v-if="!armory && inventory.loading.value" aria-busy="true" aria-label="Loading">
      <div class="mb-6 flex flex-col gap-2 sm:flex-row">
        <UiSkeleton class="h-11 flex-1" />
        <UiSkeleton class="h-11 sm:w-64" />
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="n in 12"
          :key="n"
          class="flex items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
        >
          <UiSkeleton class="size-12" />
          <div class="flex flex-1 flex-col gap-2">
            <UiSkeleton class="h-5 w-36" />
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
      <div class="mb-4 flex flex-col gap-2" role="search" aria-label="Filter weapons">
        <div class="flex flex-col gap-2 sm:flex-row">
          <label class="relative min-w-0 flex-1">
            <span class="sr-only">Search</span>
            <Search
              class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden="true"
            />
            <UiInput
              v-model="filters.query"
              type="search"
              class="pl-10"
              placeholder="Search"
              title="Weapon or character"
              autocomplete="off"
            />
          </label>
          <SortControl
            v-model:sort="sort"
            v-model:direction="direction"
            class="sm:w-56"
            :options="WEAPON_SORTS"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <label class="min-w-0 sm:w-40">
            <span class="sr-only">Equipped</span>
            <UiSelect v-model="filters.status" :options="statusOptions" />
          </label>
          <label class="min-w-0 sm:w-36">
            <span class="sr-only">Lock</span>
            <UiSelect v-model="filters.lock" :options="lockOptions" />
          </label>
          <label class="min-w-0 sm:w-32">
            <span class="sr-only">Rarity</span>
            <UiSelect v-model="filters.rarity" :options="rarityOptions" />
          </label>
          <label class="min-w-0 sm:w-36">
            <span class="sr-only">Weapon type</span>
            <UiSelect v-model="filters.type" :options="typeOptions" />
          </label>
          <ToggleChip v-model="filters.level80">Lv 80+</ToggleChip>
          <UiButton v-if="filtered" variant="ghost" @click="clearFilters">Clear</UiButton>
          <span
            v-if="filtered"
            class="tabular self-center font-mono text-sm text-text-secondary sm:ml-auto"
            aria-live="polite"
            :title="`${formatNumber(shownCopies)} weapons`"
            >{{ formatNumber(shown.length) }} / {{ formatNumber(armory.distinct) }}</span
          >
        </div>
      </div>

      <UiEmpty v-if="shown.length === 0" title="No matches">
        <template #icon><SearchX aria-hidden="true" /></template>
        <UiButton @click="clearFilters">Clear</UiButton>
      </UiEmpty>

      <template v-else>
        <ul ref="listTop" class="grid scroll-mt-20 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="row in pageRows" :key="row.id" class="flex">
            <WeaponCard :weapon="row" />
          </li>
        </ul>
        <ListPager
          v-model="page"
          class="mt-4"
          :total="shown.length"
          :page-size="PAGE_SIZE"
          label="Weapon pages"
        />
      </template>
    </template>
  </div>
</template>
