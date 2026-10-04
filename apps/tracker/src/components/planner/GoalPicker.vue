<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { Good, GoodWeapon } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { normalizeSearch } from '@/data/characters'
import { characterIcon, weaponIcon } from '@/lib/assets'
import type { EditorSubject } from './GoalEditor.vue'
import { characterGoalId, characterName, weaponGoalId, weaponName } from './model'

/**
 * Picks what to plan: a character (owned first; others start at level 1)
 * or an owned weapon. Ones that already have a goal are left out.
 */
const props = defineProps<{
  open: boolean
  planner: PlannerData
  good: Good
  /** Goal ids that exist (`character:Key`, `weapon:Key:Owner`). */
  taken: ReadonlySet<string>
}>()
const emit = defineEmits<{ close: []; pick: [subject: EditorSubject] }>()

const mode = ref<'character' | 'weapon'>('character')
const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
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

const MODES = [
  { value: 'character' as const, label: 'Characters' },
  { value: 'weapon' as const, label: 'Weapons' },
]
</script>

<template>
  <UiModal :open="open" title="Add goal" wide @close="emit('close')">
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="mode" :options="MODES" label="Kind" />
        <label class="relative min-w-0 flex-1">
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
