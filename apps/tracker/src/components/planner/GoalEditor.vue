<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import { goalEstimate } from '@gdt/game-data/planner-estimate'
import { clampTalents } from '@gdt/game-data/planner-goals'
import {
  ascensionForTalent,
  boostedTalents,
  findCharacterState,
  findWeaponState,
  normalizeLevel,
  talentCap,
  TALENTS,
  type PlanGoal,
  type PlanOptions,
  type Requirement,
  type TalentName,
} from '@gdt/game-data/planner-math'
import type { CharacterTarget, Good, WeaponTarget } from '@gdt/shared'
import { computed, reactive, ref, watch } from 'vue'
import { ArrowRight, CircleAlert, Plus, Trash2, X } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import CostList from './CostList.vue'
import LevelSelect from './LevelSelect.vue'
import {
  characterName,
  defaultCharacterTarget,
  defaultWeaponTarget,
  levelLabel,
  mergeRequirements,
  weaponGoalId,
  weaponName,
  withoutPassives,
  type EditorSubject,
  type RequirementCache,
  type WeaponGoalView,
} from './model'
import NoteInput from './NoteInput.vue'
import { remove, upsert } from './use-planner-targets'

type Op = ReturnType<typeof upsert> | ReturnType<typeof remove>

/**
 * Edits one goal: a character's target level and talents with the weapon
 * goals it holds, or a weapon goal on its own. Changes stay in a draft until
 * Save, which sends them as one request; the cost updates as you edit.
 * Talents and ascension stay a pair the game allows: a talent above the
 * target ascension's cap raises the ascension, a lower ascension caps them.
 */
const props = defineProps<{
  open: boolean
  subject: Exclude<EditorSubject, { kind: 'item' }> | null
  planner: PlannerData
  good: Good
  cache: RequirementCache
  /** The stored goal (made valid), or null for a new one. */
  characterTarget: CharacterTarget | null
  /** Ascension the stored goal was raised to for its talents. */
  raised: number | null
  /** Stored weapon goals of this subject (the character's, or the weapon itself). */
  weaponGoals: WeaponGoalView[]
  /** Every other goal, for the cost colours. */
  others: readonly PlanGoal[]
  /** The totals' options (conversions, passives, forging). */
  options: PlanOptions
  /** Drop rates for the estimate (null until loaded). */
  drops: DropRates | null
  /** The account's Adventure Rank and World Level, when set. */
  ar: number | null
  wl: number | null
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
const note = ref('')
const priority = ref('')
/** Why the target level or talents were changed for you, for the tooltip. */
const adjusted = ref('')
const raisedText = (ascension: number) =>
  `Raised to A${ascension} for talent ${talentCap(ascension - 1) + 1}+`

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
    adjusted.value = ''
    if (s.kind === 'character') {
      isNew.value = props.characterTarget === null
      const now = findCharacterState(props.good.characters, s.key).state
      const stored = props.characterTarget
      draft.character = stored
        ? { ...stored, talents: { ...stored.talents } }
        : defaultCharacterTarget(now)
      note.value = stored?.note ?? ''
      priority.value = stored?.priority === undefined ? '' : String(stored.priority)
      if (props.raised !== null) adjusted.value = raisedText(props.raised)
    } else {
      draft.character = null
      isNew.value = props.weaponGoals.length === 0
      note.value = props.weaponGoals[0]?.target.note ?? ''
      priority.value = ''
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

const TALENT_LABELS: Record<TalentName, string> = { auto: 'Attack', skill: 'Skill', burst: 'Burst' }
const talentOptions = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))
const refineOptions = [1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r}` }))

function weaponState(w: WeaponDraft) {
  return findWeaponState(props.good.weapons, w.key, w.owner)
}

// ------------------------------------------------------- valid level pairs

/** A talent above the target ascension's cap raises the ascension (and the level with it). */
function setTalent(name: TalentName, level: number) {
  const c = draft.character
  const phases = characterData.value?.ascension
  if (!c || !phases) return
  c.talents[name] = level
  const need = Math.min(phases.length - 1, ascensionForTalent(level, props.planner.talentAscension))
  if (need <= c.ascension) return
  const lv = normalizeLevel(phases, c.level, need)
  c.level = lv.level
  c.ascension = lv.ascension
  adjusted.value = raisedText(need)
}

/** A lower target ascension caps the talents at what it allows. */
function setAscension(ascension: number) {
  const c = draft.character
  if (!c) return
  c.ascension = ascension
  const { target, clamped } = clampTalents(c, props.planner.talentAscension)
  c.talents = { ...target.talents }
  // A clamped talent sits at the cap, so the highest one is the cap.
  const cap = Math.max(target.talents.auto, target.talents.skill, target.talents.burst)
  adjusted.value = clamped ? `Talents capped at ${cap} by A${ascension}` : ''
}

/** "AR 40" when the ascensions a requirement does need more than the account's AR. */
function arHint(requirement: Requirement | null | undefined): string {
  const need = requirement?.ar ?? 0
  return props.ar !== null && need > props.ar ? `AR ${need}` : ''
}

const characterRequirement = computed(() => {
  const key = characterKey.value
  return key && draft.character && current.value
    ? props.cache.character(key, current.value.state, draft.character)
    : null
})
const characterAr = computed(() => arHint(characterRequirement.value))
const weaponAr = (w: WeaponDraft) =>
  arHint(props.cache.weapon(w.key, weaponState(w).state, w.target))

/** Current talents and, with C3/C5, the levels the game shows ("9 (12)"). */
const talentNow = computed(() => {
  const c = current.value
  const key = characterKey.value
  if (!c || !key) return null
  const constellation = props.good.characters.find((x) => x.key === key)?.constellation ?? 0
  const boosted = boostedTalents(props.planner, key, c.state.talents, constellation)
  return { base: c.state.talents, boosted, constellation }
})

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
  if (characterRequirement.value) list.push(characterRequirement.value)
  for (const w of draft.weapons) {
    const r = props.cache.weapon(w.key, weaponState(w).state, w.target)
    if (r) list.push(r)
  }
  return list
})

/** This goal on its own: resin and days (domains, bosses, ley lines), weekly weeks. */
const estimate = computed(() => {
  if (requirements.value.length === 0) return null
  const owned = props.options.passives ? new Set<string>(props.options.passives) : null
  const requirement = mergeRequirements(props.planner, requirements.value, owned)
  const plan = goalEstimate(
    props.planner,
    { id: 'self', requirement },
    props.good.materials,
    props.drops,
    { ...withoutPassives(props.options), ar: props.ar, wl: props.wl },
  )
  const t = plan.total
  const weeks = plan.weeklyTotal.weeks
  if (t.resin === 0 && weeks === 0) return null
  const parts = [`~${formatCompact(t.resin)}${t.partial ? '+' : ''} · ${formatNumber(t.days)}d`]
  if (weeks > 0) parts.push(`${formatNumber(weeks)}w`)
  const title = [
    `${formatNumber(t.runs)} runs · ${formatNumber(t.resin)} resin (${formatNumber(t.condensed)} condensed) · ${formatNumber(t.days)} days`,
    weeks > 0 ? `weekly bosses: ${formatNumber(weeks)} weeks` : '',
    t.gems.runs > 0 ? `gems: ${formatNumber(t.gems.runs)} runs` : '',
    t.partial ? 'some sources have no drop rate' : '',
    plan.assumed.ar || plan.assumed.wl ? 'AR/WL not set: top bracket assumed' : '',
  ]
  return { text: parts.join(' · '), title: title.filter(Boolean).join(' · ') }
})

// ------------------------------------------------------------------- save

const priorityValue = computed(() => {
  const text = String(priority.value ?? '').trim()
  if (text === '') return undefined
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : null
})
const noteValue = () => note.value.trim() || undefined

function save() {
  const ops: Op[] = []
  const s = props.subject
  if (!s || priorityValue.value === null) return
  if (s.kind === 'character' && draft.character) {
    const target: CharacterTarget = {
      ...draft.character,
      note: noteValue(),
      priority: priorityValue.value,
    }
    ops.push(upsert({ kind: 'character', key: s.key, target }))
  }
  const kept = new Set(draft.weapons.map((w) => weaponGoalId(w.key, w.owner)))
  for (const w of props.weaponGoals) {
    if (!kept.has(w.id)) ops.push(remove({ kind: 'weapon', key: w.key, owner: w.owner }))
  }
  draft.weapons.forEach((w, index) => {
    const target = { ...w.target }
    // A weapon-only goal's note is the dialog's note.
    if (s.kind === 'weapon' && index === 0) target.note = noteValue()
    ops.push(upsert({ kind: 'weapon', key: w.key, owner: w.owner, target }))
  })
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
  <UiModal :open="open" :title="title" size="wide" @close="emit('close')">
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
          <div class="flex min-w-0 flex-col gap-1">
            <span class="flex items-center gap-1 text-sm text-text-secondary"
              >Level
              <span v-if="adjusted" class="text-warning-text" :title="adjusted">
                <CircleAlert class="size-3.5" aria-hidden="true" />
                <span class="sr-only">{{ adjusted }}</span>
              </span>
              <span class="tabular ml-auto font-mono text-text-muted">{{ currentLevel }}</span>
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true"
            /></span>
            <LevelSelect
              v-if="characterData"
              v-model:level="draft.character.level"
              :ascension="draft.character.ascension"
              :phases="characterData.ascension"
              label="Target level"
              @update:ascension="setAscension"
            />
            <span
              v-if="characterAr"
              class="tabular font-mono text-xs text-warning-text"
              :title="`A${draft.character.ascension} needs ${characterAr}`"
              >{{ characterAr }}</span
            >
          </div>
          <label v-for="t in TALENTS" :key="t" class="flex min-w-0 flex-col gap-1">
            <span class="flex items-center gap-1 text-sm text-text-secondary"
              >{{ TALENT_LABELS[t] }}
              <span
                class="tabular ml-auto font-mono text-text-muted"
                :title="
                  talentNow && talentNow.boosted[t] !== talentNow.base[t]
                    ? `${talentNow.base[t]}, shown as ${talentNow.boosted[t]} at C${talentNow.constellation}`
                    : undefined
                "
                >{{ talentNow?.base[t]
                }}<template v-if="talentNow && talentNow.boosted[t] !== talentNow.base[t]">
                  ({{ talentNow.boosted[t] }})</template
                ></span
              >
              <ArrowRight class="size-3.5 text-text-muted" aria-hidden="true"
            /></span>
            <UiSelect
              :model-value="draft.character.talents[t]"
              :options="talentOptions"
              :aria-label="`Target ${TALENT_LABELS[t]}`"
              @update:model-value="setTalent(t, $event)"
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
              <span
                v-if="weaponAr(w)"
                class="ml-1.5 text-warning-text"
                :title="`A${w.target.ascension} needs ${weaponAr(w)}`"
                >{{ weaponAr(w) }}</span
              >
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

      <!-- Note, priority, counted -->
      <section class="flex flex-col gap-3" aria-label="Details">
        <div class="flex flex-wrap items-start gap-3">
          <NoteInput v-model="note" class="min-w-0 flex-1 basis-60" />
          <label
            v-if="draft.character"
            class="flex w-24 flex-col gap-1"
            title="Lower first; empty goes last"
          >
            <span class="text-sm text-text-secondary">Priority</span>
            <UiInput
              v-model="priority"
              type="number"
              inputmode="numeric"
              min="0"
              max="100000"
              placeholder="–"
              :invalid="priorityValue === null"
            />
          </label>
        </div>
        <UiSwitch v-if="draft.character" v-model="draft.character.active" label="Counted" />
        <UiSwitch
          v-else-if="draft.weapons[0]"
          v-model="draft.weapons[0].target.active"
          label="Counted"
        />
      </section>

      <section class="flex flex-col gap-2" aria-label="Cost">
        <h3 class="text-sm font-semibold text-text-secondary">Cost</h3>
        <CostList
          :planner="planner"
          :requirements="requirements"
          :others="others"
          :inventory="good.materials"
          :options="options"
        />
      </section>
    </div>

    <template #footer>
      <UiButton v-if="!isNew" variant="ghost" class="text-danger-text" @click="removeAll">
        <Trash2 class="size-4" aria-hidden="true" />
        Remove
      </UiButton>
      <span
        class="tabular mr-auto flex items-center font-mono text-sm text-text-secondary"
        :title="estimate?.title"
        >{{ estimate?.text
        }}<span v-if="estimate" class="sr-only"> ({{ estimate.title }})</span></span
      >
      <UiButton @click="emit('close')">Cancel</UiButton>
      <UiButton
        variant="primary"
        :loading="saving"
        :disabled="priorityValue === null"
        @click="save"
      >
        {{ isNew ? 'Add' : 'Save' }}
      </UiButton>
    </template>
  </UiModal>
</template>
