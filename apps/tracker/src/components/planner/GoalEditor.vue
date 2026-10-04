<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import {
  findCharacterState,
  findWeaponState,
  type MaterialLine,
  type Requirement,
} from '@gdt/game-data/planner-math'
import type { CharacterTarget, Good, WeaponTarget } from '@gdt/shared'
import { computed, reactive, ref, watch } from 'vue'
import { ArrowRight, Plus, Trash2, X } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { characterIcon, weaponIcon } from '@/lib/assets'
import CostList from './CostList.vue'
import LevelSelect from './LevelSelect.vue'
import {
  characterName,
  defaultCharacterTarget,
  defaultWeaponTarget,
  levelLabel,
  weaponGoalId,
  weaponName,
  type RequirementCache,
  type WeaponGoalView,
} from './model'
import { remove, upsert } from './use-planner-targets'

export type EditorSubject =
  | { kind: 'character'; key: string }
  | { kind: 'weapon'; key: string; owner: string }

type Op = ReturnType<typeof upsert> | ReturnType<typeof remove>

/**
 * Edits one goal: a character's target level and talents with the weapon
 * goals it holds, or a weapon goal on its own. Changes stay in a draft until
 * Save, which sends them as one request; the cost updates as you edit.
 */
const props = defineProps<{
  open: boolean
  subject: EditorSubject | null
  planner: PlannerData
  good: Good
  cache: RequirementCache
  /** The stored goal, or null for a new one. */
  characterTarget: CharacterTarget | null
  /** Stored weapon goals of this subject (the character's, or the weapon itself). */
  weaponGoals: WeaponGoalView[]
  lines: ReadonlyMap<string, MaterialLine>
  short: { characterExp: boolean; weaponExp: boolean; mora: boolean }
  saving: boolean
}>()
const emit = defineEmits<{ close: []; save: [ops: Op[]]; remove: [ops: Op[]] }>()

interface WeaponDraft {
  key: string
  owner: string
  target: WeaponTarget
}

const draft = reactive<{ character: CharacterTarget | null; weapons: WeaponDraft[] }>({
  character: null,
  weapons: [],
})
const isNew = ref(false)

const characterKey = computed(() =>
  props.subject?.kind === 'character' ? props.subject.key : null,
)
const characterData = computed(() =>
  characterKey.value ? props.planner.characters.get(characterKey.value) : undefined,
)
const current = computed(() =>
  characterKey.value ? findCharacterState(props.good.characters, characterKey.value) : null,
)

watch(
  () => [props.open, props.subject] as const,
  ([open]) => {
    if (!open || !props.subject) return
    const s = props.subject
    if (s.kind === 'character') {
      isNew.value = props.characterTarget === null
      const now = findCharacterState(props.good.characters, s.key).state
      const stored = props.characterTarget
      draft.character = stored
        ? { ...stored, talents: { ...stored.talents } }
        : defaultCharacterTarget(now)
    } else {
      draft.character = null
      isNew.value = props.weaponGoals.length === 0
    }
    draft.weapons = props.weaponGoals.map((w) => ({
      key: w.key,
      owner: w.owner,
      target: { ...w.target },
    }))
    if (s.kind === 'weapon' && draft.weapons.length === 0) {
      const now = findWeaponState(props.good.weapons, s.key, s.owner).state
      draft.weapons.push({
        key: s.key,
        owner: s.owner,
        target: defaultWeaponTarget(props.planner, s.key, now),
      })
    }
  },
  { immediate: true },
)

const title = computed(() => {
  const s = props.subject
  if (!s) return ''
  return s.kind === 'character' ? characterName(s.key) : weaponName(s.key)
})

const TALENTS = [
  { key: 'auto', label: 'Attack' },
  { key: 'skill', label: 'Skill' },
  { key: 'burst', label: 'Burst' },
] as const
const talentOptions = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const refineOptions = [1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r}` }))

function weaponState(w: WeaponDraft) {
  return findWeaponState(props.good.weapons, w.key, w.owner)
}

// ------------------------------------------------------------ add a weapon

const weaponChoice = ref('')
const weaponOptions = computed(() => {
  const key = characterKey.value
  const type = characterData.value?.weapon
  if (!key || !type) return []
  const taken = new Set(draft.weapons.map((w) => w.key))
  const equipped = props.good.weapons.find((w) => w.location === key)
  const owned = new Set(props.good.weapons.map((w) => w.key))
  const all = [...props.planner.weapons.values()]
    .filter((w) => w.type === type && !taken.has(w.key))
    .sort((a, b) => b.rarity - a.rarity || weaponName(a.key).localeCompare(weaponName(b.key)))
  const list: { value: string; label: string }[] = [{ value: '', label: 'Add weapon' }]
  if (equipped && !taken.has(equipped.key)) {
    list.push({ value: equipped.key, label: `${weaponName(equipped.key)} (equipped)` })
  }
  for (const w of all) {
    if (w.key === equipped?.key) continue
    list.push({
      value: w.key,
      label: `${'★'.repeat(w.rarity)} ${weaponName(w.key)}${owned.has(w.key) ? '' : ' (not owned)'}`,
    })
  }
  return list
})

watch(weaponChoice, (key) => {
  if (!key || !characterKey.value) return
  const owner = characterKey.value
  const now = findWeaponState(props.good.weapons, key, owner).state
  draft.weapons.push({ key, owner, target: defaultWeaponTarget(props.planner, key, now) })
  weaponChoice.value = ''
})

// ------------------------------------------------------------------- cost

const requirements = computed<Requirement[]>(() => {
  const list: Requirement[] = []
  const key = characterKey.value
  if (key && draft.character && current.value) {
    const r = props.cache.character(key, current.value.state, draft.character)
    if (r) list.push(r)
  }
  for (const w of draft.weapons) {
    const r = props.cache.weapon(w.key, weaponState(w).state, w.target)
    if (r) list.push(r)
  }
  return list
})

// ------------------------------------------------------------------- save

function save() {
  const ops: Op[] = []
  const s = props.subject
  if (!s) return
  if (s.kind === 'character' && draft.character) {
    ops.push(upsert({ kind: 'character', key: s.key, target: { ...draft.character } }))
  }
  const kept = new Set(draft.weapons.map((w) => weaponGoalId(w.key, w.owner)))
  for (const w of props.weaponGoals) {
    if (!kept.has(w.id)) ops.push(remove({ kind: 'weapon', key: w.key, owner: w.owner }))
  }
  for (const w of draft.weapons) {
    ops.push(upsert({ kind: 'weapon', key: w.key, owner: w.owner, target: { ...w.target } }))
  }
  emit('save', ops)
}

function removeAll() {
  const s = props.subject
  if (!s) return
  const ops: Op[] = []
  if (s.kind === 'character') ops.push(remove({ kind: 'character', key: s.key }))
  for (const w of props.weaponGoals) {
    ops.push(remove({ kind: 'weapon', key: w.key, owner: w.owner }))
  }
  emit('remove', ops)
}

const currentLevel = computed(() => {
  const c = current.value
  const key = characterKey.value
  if (!c || !key) return ''
  return c.owned
    ? levelLabel(props.planner, 'character', key, c.state.level, c.state.ascension)
    : '–'
})
</script>

<template>
  <UiModal :open="open" :title="title" wide @close="emit('close')">
    <div v-if="subject" class="flex flex-col gap-5">
      <!-- Character -->
      <section v-if="draft.character && characterKey" class="flex gap-4" aria-label="Character">
        <GameIcon
          :src="characterIcon(characterKey)"
          :name="title"
          :rarity="characterData?.rarity"
          size="lg"
        />
        <div class="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <label class="flex min-w-0 flex-col gap-1">
            <span class="flex items-center gap-1 text-sm text-text-secondary"
              >Level
              <span class="tabular ml-auto font-mono text-text-muted">{{ currentLevel }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true"
            /></span>
            <LevelSelect
              v-if="characterData"
              v-model:level="draft.character.level"
              v-model:ascension="draft.character.ascension"
              :phases="characterData.ascension"
              label="Target level"
            />
          </label>
          <label v-for="t in TALENTS" :key="t.key" class="flex min-w-0 flex-col gap-1">
            <span class="flex items-center gap-1 text-sm text-text-secondary"
              >{{ t.label }}
              <span class="tabular ml-auto font-mono text-text-muted">{{
                current?.state.talents[t.key]
              }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true"
            /></span>
            <UiSelect
              v-model="draft.character.talents[t.key]"
              :options="talentOptions"
              :aria-label="`Target ${t.label}`"
            />
          </label>
        </div>
      </section>

      <!-- Weapons -->
      <section class="flex flex-col gap-2" aria-label="Weapons">
        <h3 v-if="characterKey" class="text-sm font-semibold text-text-secondary">Weapon</h3>
        <div
          v-for="(w, index) in draft.weapons"
          :key="`${w.key}:${w.owner}`"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-default p-2.5"
        >
          <GameIcon
            :src="weaponIcon(w.key, Math.max(2, weaponState(w).state.ascension))"
            :name="weaponName(w.key)"
            :rarity="planner.weapons.get(w.key)?.rarity"
            size="sm"
          />
          <span class="flex min-w-0 flex-1 basis-40 flex-col">
            <span class="truncate text-sm font-medium">{{ weaponName(w.key) }}</span>
            <span class="tabular font-mono text-xs text-text-muted">
              <template v-if="weaponState(w).owned"
                >{{
                  levelLabel(
                    planner,
                    'weapon',
                    w.key,
                    weaponState(w).state.level,
                    weaponState(w).state.ascension,
                  )
                }}
                · R{{ weaponState(w).state.refinement }}</template
              >
              <template v-else>–</template>
            </span>
          </span>
          <div class="ml-auto flex items-center gap-2">
            <LevelSelect
              v-if="planner.weapons.get(w.key)"
              v-model:level="w.target.level"
              v-model:ascension="w.target.ascension"
              :phases="planner.weapons.get(w.key)!.ascension"
              class="w-24"
              :label="`${weaponName(w.key)} target level`"
            />
            <UiSelect
              v-model="w.target.refinement"
              :options="refineOptions"
              class="w-20"
              :aria-label="`${weaponName(w.key)} target refinement`"
            />
            <button
              v-if="characterKey"
              type="button"
              class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
              :aria-label="`Remove ${weaponName(w.key)}`"
              :title="`Remove ${weaponName(w.key)}`"
              @click="draft.weapons.splice(index, 1)"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="characterKey && weaponOptions.length > 1" class="flex items-center gap-2">
          <Plus class="size-4 text-text-muted" aria-hidden="true" />
          <UiSelect
            v-model="weaponChoice"
            :options="weaponOptions"
            class="min-w-0 flex-1 sm:max-w-sm"
            aria-label="Add weapon"
          />
        </div>
      </section>

      <!-- Active and cost -->
      <UiSwitch v-if="draft.character" v-model="draft.character.active" label="Counted" />
      <UiSwitch
        v-else-if="draft.weapons[0]"
        v-model="draft.weapons[0].target.active"
        label="Counted"
      />

      <section class="flex flex-col gap-2" aria-label="Cost">
        <h3 class="text-sm font-semibold text-text-secondary">Cost</h3>
        <CostList :planner="planner" :requirements="requirements" :lines="lines" :short="short" />
      </section>
    </div>

    <template #footer>
      <UiButton v-if="!isNew" variant="ghost" class="mr-auto text-danger-text" @click="removeAll">
        <Trash2 class="size-4" aria-hidden="true" />
        Remove
      </UiButton>
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :loading="saving" @click="save">
        {{ isNew ? 'Add' : 'Save' }}
      </UiButton>
    </template>
  </UiModal>
</template>
