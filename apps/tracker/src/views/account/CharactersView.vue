<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Search, SearchX, Upload, Users } from 'lucide-vue-next'
import CharacterCard from '@/components/characters/CharacterCard.vue'
import CharacterDetail from '@/components/characters/CharacterDetail.vue'
import SortControl from '@/components/characters/SortControl.vue'
import ToggleChip from '@/components/characters/ToggleChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadLatestInventory } from '@/data/account-data'
import {
  CHARACTER_SORTS,
  ELEMENTS,
  ELEMENT_LABELS,
  NO_CHARACTER_FILTERS,
  WEAPON_TYPES,
  WEAPON_TYPE_LABELS,
  buildRoster,
  filterCharacters,
  hasCharacterFilters,
  sortCharacters,
  type CharacterFilters,
  type CharacterSort,
  type SortDirection,
} from '@/data/characters'
import { useResource } from '@/data/use-resource'
import { formatNumber } from '@/lib/format'
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

const saved = readJson<{ sort?: string; direction?: string }>('characters:sort', {})
const sort = ref<CharacterSort>(
  CHARACTER_SORTS.some((s) => s.value === saved.sort) ? (saved.sort as CharacterSort) : 'level',
)
const direction = ref<SortDirection>(saved.direction === 'asc' ? 'asc' : 'desc')
watch([sort, direction], () =>
  writeJson('characters:sort', { sort: sort.value, direction: direction.value }),
)

const elementOptions = [
  { value: 'all' as const, label: 'Element' },
  ...ELEMENTS.map((e) => ({ value: e, label: ELEMENT_LABELS[e] })),
]
const rarityOptions = [
  { value: 'all' as const, label: 'Rarity' },
  { value: 5 as const, label: '5★' },
  { value: 4 as const, label: '4★' },
]
const weaponOptions = [
  { value: 'all' as const, label: 'Weapon' },
  ...WEAPON_TYPES.map((w) => ({ value: w, label: WEAPON_TYPE_LABELS[w] })),
]

const shown = computed(() =>
  roster.value
    ? sortCharacters(
        filterCharacters(roster.value.characters, filters),
        sort.value,
        direction.value,
      )
    : [],
)

function clearFilters() {
  Object.assign(filters, NO_CHARACTER_FILTERS)
}

// ------------------------------------------------------------------ details

const selectedKey = ref<string | null>(null)
const selected = computed(
  () => roster.value?.characters.find((c) => c.key === selectedKey.value) ?? null,
)
</script>

<template>
  <div>
    <PageHeader title="Characters">
      <template #meta>
        <UiSkeleton v-if="!roster && inventory.loading.value" class="mt-2 h-5 w-56 max-w-full" />
        <p v-else-if="roster" class="mt-1 flex flex-wrap gap-x-4 text-text-secondary">
          <span
            ><span class="tabular font-mono text-text-primary">{{
              formatNumber(roster.total)
            }}</span>
            total</span
          >
          <span
            ><span class="tabular font-mono text-text-primary">{{ formatNumber(roster.c6) }}</span>
            C6</span
          >
          <span
            ><span class="tabular font-mono text-text-primary">{{
              formatNumber(roster.level90)
            }}</span>
            Lv 90+</span
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

    <div v-if="!roster && inventory.loading.value" aria-busy="true" aria-label="Loading">
      <div class="mb-6 flex flex-col gap-2 sm:flex-row">
        <UiSkeleton class="h-11 flex-1" />
        <UiSkeleton class="h-11 sm:w-64" />
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="n in 12"
          :key="n"
          class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-3"
        >
          <div class="flex items-center gap-3">
            <UiSkeleton class="size-16" />
            <div class="flex flex-1 flex-col gap-2">
              <UiSkeleton class="h-6 w-32" />
              <UiSkeleton class="h-4 w-full" />
              <UiSkeleton class="h-3 w-24" />
            </div>
          </div>
          <UiSkeleton class="h-9 w-full" />
        </div>
      </div>
    </div>

    <UiEmpty
      v-else-if="inventory.data.value === null || (roster && roster.total === 0)"
      title="No characters"
    >
      <template #icon><Users aria-hidden="true" /></template>
      <UiButton variant="primary" :to="{ name: 'account-import' }">
        <Upload class="size-5" aria-hidden="true" />
        Import
      </UiButton>
    </UiEmpty>

    <template v-else-if="roster">
      <div class="mb-4 flex flex-col gap-2" role="search" aria-label="Filter characters">
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
              title="Name, weapon or set"
              autocomplete="off"
            />
          </label>
          <SortControl
            v-model:sort="sort"
            v-model:direction="direction"
            class="sm:w-56"
            :options="CHARACTER_SORTS"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <label class="min-w-0 sm:w-36">
            <span class="sr-only">Element</span>
            <UiSelect v-model="filters.element" :options="elementOptions" />
          </label>
          <label class="min-w-0 sm:w-32">
            <span class="sr-only">Rarity</span>
            <UiSelect v-model="filters.rarity" :options="rarityOptions" />
          </label>
          <label class="min-w-0 sm:w-36">
            <span class="sr-only">Weapon type</span>
            <UiSelect v-model="filters.weaponType" :options="weaponOptions" />
          </label>
          <ToggleChip v-model="filters.fourPiece" title="Wearing a 4-piece set">4pc</ToggleChip>
          <ToggleChip v-model="filters.talents9" title="All three talents at 9 or above"
            >Talents 9+</ToggleChip
          >
          <UiButton v-if="filtered" variant="ghost" @click="clearFilters">Clear</UiButton>
          <span
            v-if="filtered"
            class="tabular self-center font-mono text-sm text-text-secondary sm:ml-auto"
            aria-live="polite"
            >{{ formatNumber(shown.length) }} / {{ formatNumber(roster.total) }}</span
          >
        </div>
      </div>

      <UiEmpty v-if="shown.length === 0" title="No matches">
        <template #icon><SearchX aria-hidden="true" /></template>
        <UiButton @click="clearFilters">Clear</UiButton>
      </UiEmpty>

      <ul v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <li v-for="c in shown" :key="c.key" class="flex">
          <CharacterCard :character="c" @open="selectedKey = c.key" />
        </li>
      </ul>
    </template>

    <UiModal
      :open="selected !== null"
      :title="selected?.name ?? ''"
      wide
      @close="selectedKey = null"
    >
      <CharacterDetail v-if="selected" :character="selected" :account="account" />
    </UiModal>
  </div>
</template>
