<script setup lang="ts">
import type { MaterialKind, PlannerData } from '@gdt/game-data'
import type { Good, GoodWeapon } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { normalizeSearch } from '@/data/characters'
import { characterIcon, gameIcon, materialIcon, weaponIcon } from '@/lib/assets'
import { formatCompact } from '@/lib/format'
import {
  characterGoalId,
  characterName,
  itemGoalId,
  weaponGoalId,
  weaponName,
  type EditorSubject,
} from './model'

type Mode = 'character' | 'weapon' | 'item'

/**
 * Picks what to plan: a character (owned first; others start at level 1),
 * an owned weapon, or a material for an extra need. Ones that already have
 * a goal are left out.
 */
const props = defineProps<{
  open: boolean
  planner: PlannerData
  good: Good
  /** Goal ids that exist (`character:Key`, `weapon:Key:Owner`, `item:Key`). */
  taken: ReadonlySet<string>
  /** The tab it opens on (else the last one used). */
  start?: Mode | null
}>()
const emit = defineEmits<{ close: []; pick: [subject: EditorSubject] }>()

const mode = ref<Mode>('character')
const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    if (props.start) mode.value = props.start
  },
)

const matches = (name: string) => {
  const q = normalizeSearch(query.value).trim()
  return !q || normalizeSearch(name).includes(q)
}

const characters = computed(() => {
  const owned = new Set(props.good.characters.map((c) => c.key))
  // The Traveler is one GOOD entry on its current element; every element can be planned.
  const keys = new Set([...owned, ...props.planner.characters.keys()])
  return [...keys]
    .filter((key) => props.planner.characters.has(key) && !props.taken.has(characterGoalId(key)))
    .map((key) => ({
      key,
      name: characterName(key),
      owned: owned.has(key),
      rarity: props.planner.characters.get(key)?.rarity,
      level: props.good.characters.find((c) => c.key === key)?.level,
    }))
    .filter((c) => matches(c.name))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name))
})

const weapons = computed(() => {
  // One row per weapon key and holder: the best copy of each.
  const best = new Map<string, GoodWeapon>()
  for (const w of props.good.weapons) {
    if (!props.planner.weapons.has(w.key)) continue
    const id = weaponGoalId(w.key, w.location)
    if (props.taken.has(id)) continue
    const seen = best.get(id)
    if (!seen || w.level > seen.level || w.refinement > seen.refinement) best.set(id, w)
  }
  return [...best.values()]
    .map((w) => ({
      id: weaponGoalId(w.key, w.location),
      weapon: w,
      name: weaponName(w.key),
      rarity: props.planner.weapons.get(w.key)?.rarity,
      owner: w.location ? characterName(w.location) : '',
    }))
    .filter((w) => matches(`${w.name} ${w.owner}`))
    .sort(
      (a, b) =>
        (b.rarity ?? 0) - (a.rarity ?? 0) ||
        a.name.localeCompare(b.name) ||
        a.owner.localeCompare(b.owner),
    )
    .slice(0, 300)
})

/** Domain drops first, then bosses, local specialties, enemies, the rest. */
const KIND_ORDER: MaterialKind[] = [
  'book',
  'weapon',
  'gem',
  'boss',
  'weekly',
  'local',
  'common',
  'elite',
  'crown',
  'currency',
  'exp',
  'ore',
  'mora',
]

const materials = computed(() =>
  [...props.planner.materialsByKey.values()]
    .filter((m) => !props.taken.has(itemGoalId(m.key)) && matches(m.name))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        (a.family?.key ?? a.key).localeCompare(b.family?.key ?? b.key) ||
        a.tier - b.tier,
    )
    .map((m) => ({
      material: m,
      icon: m.key === props.planner.mora.key ? materialIcon('Mora') : gameIcon(m.icon),
      have: props.good.materials[m.key] ?? 0,
    })),
)

const MODES = [
  { value: 'character' as const, label: 'Characters' },
  { value: 'weapon' as const, label: 'Weapons' },
  { value: 'item' as const, label: 'Items' },
]
</script>

<template>
  <UiModal :open="open" title="Add goal" wide @close="emit('close')">
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="mode" :options="MODES" label="Kind" />
        <label class="relative min-w-0 flex-1 basis-48">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput v-model="query" class="pl-9" placeholder="Search" type="search" />
        </label>
      </div>

      <ul
        v-if="mode === 'character'"
        class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
        aria-label="Characters"
      >
        <li v-for="c in characters" :key="c.key">
          <button
            type="button"
            class="flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-surface-overlay"
            :class="c.owned ? '' : 'opacity-60'"
            :title="c.owned ? `${c.name} · Lv ${c.level}` : `${c.name} · not owned`"
            @click="emit('pick', { kind: 'character', key: c.key })"
          >
            <GameIcon :src="characterIcon(c.key)" :name="c.name" :rarity="c.rarity" size="lg" />
            <span class="line-clamp-2 text-xs leading-tight">{{ c.name }}</span>
          </button>
        </li>
      </ul>

      <ul
        v-else-if="mode === 'item'"
        class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
        aria-label="Items"
      >
        <li v-for="m in materials" :key="m.material.key">
          <button
            type="button"
            class="flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-surface-overlay"
            :title="m.material.name"
            @click="emit('pick', { kind: 'item', key: m.material.key })"
          >
            <span
              class="size-12 overflow-hidden rounded-lg text-xs"
              :class="RARITY_SOFT[m.material.rarity] ?? 'bg-surface-sunken'"
            >
              <MaterialIcon :src="m.icon" :name="m.material.name" />
            </span>
            <span class="line-clamp-2 text-xs leading-tight">{{ m.material.name }}</span>
            <span class="tabular font-mono text-[0.6875rem] text-text-muted">{{
              formatCompact(m.have)
            }}</span>
          </button>
        </li>
      </ul>

      <ul v-else class="flex flex-col gap-1" aria-label="Weapons">
        <li v-for="w in weapons" :key="w.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-overlay"
            @click="emit('pick', { kind: 'weapon', key: w.weapon.key, owner: w.weapon.location })"
          >
            <GameIcon
              :src="weaponIcon(w.weapon.key, w.weapon.ascension)"
              :name="w.name"
              :rarity="w.rarity"
              size="sm"
            />
            <span class="min-w-0 flex-1 truncate text-sm">{{ w.name }}</span>
            <span class="tabular shrink-0 font-mono text-xs text-text-muted"
              >{{ w.weapon.level }} · R{{ w.weapon.refinement }}</span
            >
            <GameIcon
              v-if="w.weapon.location"
              :src="characterIcon(w.weapon.location)"
              :name="w.owner"
              size="xs"
              class="rounded-full!"
              :title="w.owner"
            />
            <span v-else class="size-7 shrink-0" />
          </button>
        </li>
      </ul>
    </div>
  </UiModal>
</template>
