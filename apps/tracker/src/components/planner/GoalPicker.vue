<script setup lang="ts">
import type { MaterialKind, PlannerData } from '@gdt/game-data'
import type { CustomCharacter, Good } from '@gdt/shared'
import { computed, reactive, ref, watch } from 'vue'
import { Plus, Search } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { RARITY_SOFT } from '@/components/characters/tokens'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import { normalizeSearch } from '@/data/characters'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import CustomForm from './CustomForm.vue'
import { characterGoalId, itemGoalId } from './model'
import { DEFAULT_PRESET, PRESETS, presetById, type PresetId } from './presets'
import RosterGrid from './RosterGrid.vue'
import WeaponChooser from './WeaponChooser.vue'

type Mode = 'character' | 'weapon' | 'item' | 'custom'

/**
 * Adds goals: several characters at once with one preset (the roster, owned
 * first, with filters), a weapon (any, owned or not; the same one again is
 * another goal), a material for an extra need, or a custom character (one
 * the game data doesn't have yet). Characters and items that have a goal
 * are left out.
 */
const props = defineProps<{
  open: boolean
  /** The game's planner data (no custom characters). */
  planner: PlannerData
  good: Good
  /** Goal ids that exist (`character:Key`, `item:Key`, …). */
  taken: ReadonlySet<string>
  /** The tab it opens on (else the last one used). */
  start?: Mode | null
  saving?: boolean
}>()
const emit = defineEmits<{
  close: []
  characters: [keys: string[], preset: PresetId]
  weapon: [key: string, owner: string]
  item: [key: string]
  custom: [profile: CustomCharacter, preset: PresetId]
}>()

const mode = ref<Mode>('character')
const query = ref('')
const selected = ref<Set<string>>(new Set())
const savedPreset = readStorage('planner:preset')
const preset = ref<PresetId>(presetById(savedPreset ?? '')?.id ?? DEFAULT_PRESET)
watch(preset, (value) => writeStorage('planner:preset', value))
const blank = (): CustomCharacter => ({ name: '', rarity: 5, element: 'Pyro', weapon: 'sword' })
const custom = reactive<{ profile: CustomCharacter }>({ profile: blank() })

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    selected.value = new Set()
    custom.profile = blank()
    if (props.start) mode.value = props.start
  },
)

const excluded = computed(
  () =>
    new Set(
      [...props.planner.characters.keys()].filter((key) => props.taken.has(characterGoalId(key))),
    ),
)

function toggle(key: string) {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

const matches = (name: string) => {
  const q = normalizeSearch(query.value).trim()
  return !q || normalizeSearch(name).includes(q)
}

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
  { value: 'custom' as const, label: 'Custom' },
]
const presetOptions = PRESETS.map((p) => ({ value: p.id, label: p.label }))
const presetTitle = computed(() => presetById(preset.value)?.title ?? '')

function addCharacters() {
  if (selected.value.size) emit('characters', [...selected.value], preset.value)
}
function addCustom() {
  const name = custom.profile.name.trim()
  if (name) emit('custom', { ...custom.profile, name }, preset.value)
}
</script>

<template>
  <UiModal :open="open" title="Add goal" size="wide" @close="emit('close')">
    <div class="flex flex-col gap-3">
      <div class="scroll-hide scroll-fade-x -mx-1 flex overflow-x-auto px-1">
        <UiSegmented v-model="mode" :options="MODES" label="Kind" />
      </div>

      <RosterGrid
        v-if="mode === 'character'"
        :planner="planner"
        :good="good"
        :selected="selected"
        :exclude="excluded"
        multi
        @toggle="toggle"
      />

      <WeaponChooser
        v-else-if="mode === 'weapon'"
        :planner="planner"
        :good="good"
        @pick="(key, owner) => emit('weapon', key, owner)"
      />

      <CustomForm
        v-else-if="mode === 'custom'"
        :planner="planner"
        :profile="custom.profile"
        live
        @change="(p) => (custom.profile = p)"
      />

      <template v-else>
        <label class="relative">
          <span class="sr-only">Search items</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput v-model="query" class="pl-9" placeholder="Search" type="search" />
        </label>
        <ul
          class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
          aria-label="Items"
        >
          <li v-for="m in materials" :key="m.material.key">
            <button
              type="button"
              class="flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-surface-overlay"
              :title="m.material.name"
              @click="emit('item', m.material.key)"
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
      </template>
    </div>

    <template v-if="mode === 'character' || mode === 'custom'" #footer>
      <UiSelect
        v-model="preset"
        :options="presetOptions"
        class="mr-auto w-36 sm:w-40"
        aria-label="Preset"
        :title="presetTitle"
      />
      <UiButton class="max-sm:hidden!" @click="emit('close')">Cancel</UiButton>
      <UiButton
        v-if="mode === 'character'"
        variant="primary"
        :disabled="selected.size === 0"
        :loading="saving"
        @click="addCharacters"
      >
        <Plus class="size-4" aria-hidden="true" />
        Add{{ selected.size ? ` ${formatNumber(selected.size)}` : '' }}
      </UiButton>
      <UiButton
        v-else
        variant="primary"
        :disabled="custom.profile.name.trim() === ''"
        :loading="saving"
        @click="addCustom"
      >
        <Plus class="size-4" aria-hidden="true" />
        Add
      </UiButton>
    </template>
  </UiModal>
</template>
