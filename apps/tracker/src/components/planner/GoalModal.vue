<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import type { DropRates } from '@gdt/game-data/drops'
import type { FarmingData } from '@gdt/game-data/farming'
import { goalEstimate } from '@gdt/game-data/planner-estimate'
import {
  TALENTS,
  constellationBoosts,
  type CharacterState,
  type PlanGoal,
  type PlanOptions,
  type Requirement,
  type TalentName,
  type WeaponState,
} from '@gdt/game-data/planner-math'
import type {
  ArtifactGoal,
  CharacterTarget,
  CustomCharacter,
  Good,
  WeaponTarget,
} from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  CircleAlert,
  Eye,
  EyeOff,
  NotebookPen,
  PencilLine,
  Plus,
  Replace,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-vue-next'
import { RARITY_TEXT } from '@/components/characters/tokens'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import GameIcon from '@/components/ui/GameIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import ArtifactGoalBlock from './ArtifactGoalBlock.vue'
import CostList from './CostList.vue'
import CustomForm from './CustomForm.vue'
import { daysText, weeksText } from './farm-format'
import { resinDays } from './farm-today'
import LevelGrid from './LevelGrid.vue'
import { goalAtLeast, talentGap, type LevelStep } from './level-grid'
import {
  characterName,
  levelLabel,
  mergeRequirements,
  withoutPassives,
  wornByCharacter,
  type GoalEntry,
  type WeaponGoalView,
} from './model'
import NumberStepper from './NumberStepper.vue'
import { PRESETS, applyPreset, type Preset } from './presets'
import RosterGrid from './RosterGrid.vue'
import WeaponChooser from './WeaponChooser.vue'
import WeaponGoalBlock from './WeaponGoalBlock.vue'

/**
 * One goal card's editor, Seelie-style, saving as you go (no Save button):
 * a character's Level (now and goal as level buttons), Talents (− / +
 * steppers, C3/C5 marked, a warning when the goal level's ascension doesn't
 * allow them) and Weapon goals (any weapon of its type, owned or not, the
 * same one twice if wanted), Artifacts (sets, main stats and ticks, ticked
 * from the capture too: ArtifactGoalBlock); a custom character also has its
 * profile and "Replace with" a real one. Presets set the whole goal in one click. A
 * weapon on its own card gets its editor alone. The cost of the card is
 * beside it (below on phones), each tile coloured by what the bag covers.
 * The header has the favourite, counted and delete (with Undo, from the
 * page); the note folds away.
 *
 * Every change is emitted as it happens; the page writes it (optimistic,
 * sent after a short pause) and hands the new state back down.
 */
const props = defineProps<{
  open: boolean
  entry: GoalEntry | null
  /** The planner data with custom characters in it. */
  planner: PlannerData
  /** The game's alone (the roster "Replace with" picks from). */
  basePlanner: PlannerData
  /** The capture's characters and weapons, with the planner's bag as `materials`. */
  good: Good
  /** Every goal but this card's, for the cost colours. */
  others: readonly PlanGoal[]
  options: PlanOptions
  drops: DropRates | null
  ar: number | null
  wl: number | null
  refreshes: number
  /** Character keys with a goal (not offered by "Replace with"). */
  taken: ReadonlySet<string>
  /** Custom characters' names by id. */
  names: ReadonlyMap<string, string>
  /** Artifact domains and the rest (null: not loaded). */
  farming: FarmingData | null
  /** The tab to open on (a card's Artifacts row); null: the last one used. */
  startTab?: string | null
}>()
const emit = defineEmits<{
  close: []
  /** The card's character goal (custom ones keep their profile in it). */
  character: [target: CharacterTarget & { custom?: CustomCharacter }]
  /** The character's current state set by hand (null: the capture's). */
  characterNow: [state: CharacterState | null]
  weapon: [weapon: WeaponGoalView, target: WeaponTarget]
  weaponNow: [weapon: WeaponGoalView, state: WeaponState | null]
  addWeapon: [key: string]
  removeWeapon: [weapon: WeaponGoalView]
  toggle: []
  favorite: []
  remove: []
  replace: [real: string]
}>()

const c = computed(() => props.entry?.character ?? null)
const lone = computed(() => (c.value ? null : (props.entry?.weapons[0] ?? null)))
const stored = computed(() => c.value?.stored ?? null)
const phases = computed(() =>
  c.value ? (props.planner.characters.get(c.value.key)?.ascension ?? null) : null,
)

type Tab = 'level' | 'talents' | 'weapon' | 'artifacts' | 'custom'
const TABS_SAVED: readonly string[] = ['talents', 'weapon', 'artifacts']
const saved = readStorage('planner:goal-tab')
const tab = ref<Tab>(saved && TABS_SAVED.includes(saved) ? (saved as Tab) : 'level')
watch(tab, (value) => writeStorage('planner:goal-tab', value))
const tabs = computed(() => {
  const list: { value: Tab; label: string; count?: number }[] = [
    { value: 'level', label: 'Level' },
    { value: 'talents', label: 'Talents' },
    { value: 'weapon', label: 'Weapon', count: props.entry?.weapons.length || undefined },
    { value: 'artifacts', label: 'Artifacts' },
  ]
  if (c.value?.custom) list.push({ value: 'custom', label: 'Custom' })
  return list
})

const adding = ref(false)
const replacing = ref(false)
const replaceWith = ref<string | null>(null)
const noteOpen = ref(false)
const note = ref('')
watch(
  () => [props.open, props.entry?.id] as const,
  ([open], before) => {
    if (!open) return
    if (before?.[1] !== props.entry?.id || !before?.[0]) {
      adding.value = false
      replacing.value = false
      replaceWith.value = null
      noteOpen.value = !!props.entry?.note
      note.value = props.entry?.note ?? ''
      if (props.startTab && TABS_SAVED.includes(props.startTab)) tab.value = props.startTab as Tab
      if (tab.value === 'custom' && !c.value?.custom) tab.value = 'level'
    }
  },
  { immediate: true },
)

// ------------------------------------------------------------- character

function setCharacter(next: CharacterTarget & { custom?: CustomCharacter }) {
  emit('character', next)
}

function setNow(next: CharacterState) {
  emit('characterNow', next)
  const goal = stored.value
  if (!goal) return
  const raised = goalAtLeast(goal, next)
  if (JSON.stringify(raised) !== JSON.stringify(goal)) setCharacter(raised)
}

function pickNow(step: LevelStep) {
  const ch = c.value
  if (ch)
    setNow({ level: step.level, ascension: step.ascension, talents: { ...ch.current.talents } })
}

function pickGoal(step: LevelStep) {
  if (stored.value) setCharacter({ ...stored.value, level: step.level, ascension: step.ascension })
}

function setNowTalent(t: TalentName, value: number) {
  const ch = c.value
  if (ch) setNow({ ...ch.current, talents: { ...ch.current.talents, [t]: value } })
}

function setGoalTalent(t: TalentName, value: number) {
  if (stored.value)
    setCharacter({ ...stored.value, talents: { ...stored.value.talents, [t]: value } })
}

const gap = computed(() =>
  phases.value && stored.value
    ? talentGap(phases.value, stored.value, props.planner.talentAscension)
    : null,
)
const gapLabel = computed(() => {
  const g = gap.value
  const ch = c.value
  return g && ch
    ? levelLabel(props.planner, 'character', ch.key, g.level.level, g.level.ascension)
    : ''
})
function fixGap() {
  const g = gap.value
  if (g && stored.value) setCharacter({ ...stored.value, ...g.level })
}

const TALENT_LABELS: Record<TalentName, string> = { auto: 'Attack', skill: 'Skill', burst: 'Burst' }
const boosts = computed(() =>
  c.value ? constellationBoosts(props.planner, c.value.key) : { c3: null, c5: null },
)
/** "C3" / "C5" for the talent a constellation raises by 3, and whether it is reached. */
function boostOf(t: TalentName) {
  const b = boosts.value
  const at = b.c3 === t ? 3 : b.c5 === t ? 5 : 0
  return at ? { at, on: (c.value?.constellation ?? 0) >= at } : null
}

function setConstellation(value: number) {
  const ch = c.value
  if (!ch || !stored.value) return
  const constellation = value > ch.capturedConstellation ? value : undefined
  setCharacter({ ...stored.value, constellation })
}

const presetOn = (p: Preset) => {
  const ch = c.value
  const goal = stored.value
  if (!ch || !goal) return false
  const made = applyPreset(p, ch.current, goal, phases.value ?? undefined)
  return (
    made.level === goal.level &&
    made.ascension === goal.ascension &&
    TALENTS.every((t) => made.talents[t] === goal.talents[t])
  )
}
function usePreset(p: Preset) {
  const ch = c.value
  if (ch && stored.value)
    setCharacter(applyPreset(p, ch.current, stored.value, phases.value ?? undefined))
}

const capturedText = computed(() => {
  const ch = c.value
  if (!ch) return ''
  if (!ch.owned) return ch.custom ? 'Custom' : 'Not owned'
  const s = ch.captured
  return `${levelLabel(props.planner, 'character', ch.key, s.level, s.ascension)} · ${s.talents.auto}/${s.talents.skill}/${s.talents.burst}`
})
const levelEdited = computed(() => {
  const ch = c.value
  return (
    !!ch &&
    ch.edited &&
    (ch.current.level !== ch.captured.level || ch.current.ascension !== ch.captured.ascension)
  )
})
const talentsEdited = computed(() => {
  const ch = c.value
  return !!ch && ch.edited && TALENTS.some((t) => ch.current.talents[t] !== ch.captured.talents[t])
})
/** What the character wears (nothing for a custom one). */
const worn = computed(() =>
  c.value && !c.value.custom ? wornByCharacter(props.good, c.value.key) : new Map(),
)
function setArtifacts(artifacts: ArtifactGoal | undefined) {
  if (stored.value) setCharacter({ ...stored.value, artifacts })
}

const arNeed = computed(() => {
  const need = c.value?.requirement?.ar ?? 0
  return props.ar !== null && need > props.ar ? need : 0
})

// ------------------------------------------------------------------ note

let noteTimer: ReturnType<typeof setTimeout> | undefined
function saveNote() {
  clearTimeout(noteTimer)
  const text = note.value.trim() || undefined
  if ((props.entry?.note || undefined) === text) return
  if (stored.value) setCharacter({ ...stored.value, note: text })
  else if (lone.value) emit('weapon', lone.value, { ...lone.value.target, note: text })
}
function onNote() {
  clearTimeout(noteTimer)
  noteTimer = setTimeout(saveNote, 800)
}
watch(
  () => props.open,
  (open) => {
    if (!open) saveNote()
  },
)
onBeforeUnmount(saveNote)

// ------------------------------------------------------------------ cost

const requirements = computed<Requirement[]>(() => {
  const e = props.entry
  if (!e) return []
  return [e.character, ...e.weapons].flatMap((x) => (x?.requirement ? [x.requirement] : []))
})

/** This card on its own: resin and days (domains, bosses, ley lines), weekly weeks. */
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
  const days = resinDays(t.resin, props.refreshes)
  const parts = [`~${formatCompact(t.resin)}${t.partial ? '+' : ''} resin · ${daysText(days)}`]
  if (weeks > 0) parts.push(weeksText(weeks))
  const title = [
    `${formatNumber(t.runs)} runs · ${formatNumber(t.resin)} resin (${formatNumber(t.condensed)} condensed) · ${formatNumber(days)} days`,
    weeks > 0 ? `weekly bosses: ${formatNumber(weeks)} weeks` : '',
    t.partial ? 'some sources have no drop rate' : '',
    plan.assumed.ar || plan.assumed.wl ? 'AR/WL not set: top bracket assumed' : '',
  ]
  return { text: parts.join(' · '), title: title.filter(Boolean).join(' · ') }
})

// --------------------------------------------------------------- chrome

const title = computed(() => props.entry?.name ?? '')
const portrait = computed(() => {
  const ch = c.value
  if (ch) return { src: ch.custom ? '' : characterIcon(ch.key), rarity: ch.rarity }
  const w = lone.value
  return w
    ? { src: weaponIcon(w.key, w.target.ascension), rarity: w.rarity }
    : { src: '', rarity: null }
})
const holderName = (key: string) => props.names.get(key) ?? characterName(key)

function pickWeapon(key: string) {
  adding.value = false
  emit('addWeapon', key)
}

function confirmReplace() {
  if (replaceWith.value) emit('replace', replaceWith.value)
  cancelReplace()
}
function cancelReplace() {
  replacing.value = false
  replaceWith.value = null
}
const replaceSelected = computed<ReadonlySet<string>>(
  () => new Set(replaceWith.value ? [replaceWith.value] : []),
)
</script>

<template>
  <UiModal :open="open && !!entry" :title="title" size="detail" @close="emit('close')">
    <template #heading>
      <div class="mr-auto flex min-w-0 flex-1 items-center gap-2.5">
        <GameIcon
          :src="portrait.src"
          :name="title"
          :rarity="portrait.rarity ?? undefined"
          size="sm"
        />
        <ElementIcon v-if="c?.element" :element="c.element" />
        <h2 class="min-w-0 truncate text-lg font-semibold">{{ title }}</h2>
        <span
          v-if="c?.rarity"
          class="hidden shrink-0 text-sm sm:inline"
          :class="RARITY_TEXT[c.rarity]"
          aria-hidden="true"
          >{{ '★'.repeat(c.rarity) }}</span
        >
      </div>
      <button
        v-if="c && entry"
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-overlay"
        :class="entry.favorite ? 'text-rarity-5' : 'text-text-muted hover:text-text-primary'"
        :aria-pressed="entry.favorite"
        :aria-label="`${title}: favorite`"
        :title="entry.favorite ? 'Favorite' : 'Not a favorite'"
        @click="emit('favorite')"
      >
        <Star class="size-5" :fill="entry.favorite ? 'currentColor' : 'none'" aria-hidden="true" />
      </button>
      <button
        v-if="entry"
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        :aria-pressed="entry.active"
        :aria-label="`${title}: ${entry.active ? 'counted' : 'not counted'}`"
        :title="entry.active ? 'Counted' : 'Not counted'"
        @click="emit('toggle')"
      >
        <Eye v-if="entry.active" class="size-5" aria-hidden="true" />
        <EyeOff v-else class="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-danger-text"
        :aria-label="`Remove ${title}`"
        :title="`Remove ${title}`"
        @click="emit('remove')"
      >
        <Trash2 class="size-5" aria-hidden="true" />
      </button>
    </template>

    <div v-if="entry" class="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div class="flex min-w-0 flex-col gap-4">
        <!-- Presets, constellation, note -->
        <div v-if="c && stored" class="flex flex-wrap items-center gap-2">
          <div
            class="scroll-hide scroll-fade-x -mx-1 flex min-w-0 flex-1 basis-full gap-1.5 overflow-x-auto px-1 sm:basis-auto"
            role="group"
            aria-label="Presets"
          >
            <FilterChip
              v-for="p in PRESETS"
              :key="p.id"
              :pressed="presetOn(p)"
              :title="p.title"
              @toggle="usePreset(p)"
              >{{ p.label }}</FilterChip
            >
          </div>
          <span
            class="inline-flex items-center gap-1.5"
            title="Constellation (C3/C5 raise a talent by 3)"
          >
            <span class="text-sm text-text-muted">C</span>
            <NumberStepper
              :model-value="c.constellation"
              :min="c.capturedConstellation"
              :max="6"
              label="Constellation"
              @update:model-value="setConstellation"
            />
          </span>
          <UiButton
            variant="ghost"
            size="sm"
            :aria-expanded="noteOpen"
            :title="noteOpen ? 'Hide note' : 'Note'"
            @click="noteOpen = !noteOpen"
          >
            <NotebookPen class="size-4" aria-hidden="true" />
            Note
          </UiButton>
        </div>
        <div v-else class="flex justify-end">
          <UiButton
            variant="ghost"
            size="sm"
            :aria-expanded="noteOpen"
            @click="noteOpen = !noteOpen"
          >
            <NotebookPen class="size-4" aria-hidden="true" />
            Note
          </UiButton>
        </div>
        <textarea
          v-if="noteOpen"
          v-model="note"
          rows="2"
          maxlength="1000"
          aria-label="Note"
          placeholder="Note"
          class="min-h-10 w-full resize-y rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          @input="onNote"
          @blur="saveNote"
        />

        <!-- A weapon on its own card -->
        <WeaponGoalBlock
          v-if="lone"
          :planner="planner"
          :weapon="lone"
          :ar="ar"
          :holder="lone.owner ? holderName(lone.owner) : undefined"
          @target="emit('weapon', lone, $event)"
          @now="emit('weaponNow', lone, $event)"
        />

        <template v-if="c && stored && phases">
          <UiSegmented v-model="tab" :options="tabs" label="Goal part" class="self-start" />

          <!-- Level -->
          <section v-if="tab === 'level'" class="flex flex-col gap-3" aria-label="Level">
            <div class="flex flex-col gap-1.5">
              <span class="flex items-center gap-2 text-xs font-medium text-text-muted">
                Now
                <span v-if="levelEdited" class="inline-flex items-center gap-1 text-accent-text">
                  <PencilLine class="size-3.5" aria-label="Set by hand" role="img" />
                </span>
              </span>
              <LevelGrid
                :phases="phases"
                :level="c.current.level"
                :ascension="c.current.ascension"
                :min="c.captured"
                label="Level now"
                @pick="pickNow"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <span class="flex items-center gap-2 text-xs font-medium text-text-muted">
                Goal
                <span v-if="arNeed" class="text-warning-text" :title="`Needs AR ${arNeed}`"
                  >AR {{ arNeed }}</span
                >
              </span>
              <LevelGrid
                :phases="phases"
                :level="stored.level"
                :ascension="stored.ascension"
                :from="c.current"
                label="Level goal"
                @pick="pickGoal"
              />
            </div>
          </section>

          <!-- Talents -->
          <section v-else-if="tab === 'talents'" class="flex flex-col gap-2" aria-label="Talents">
            <div
              class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[8rem_auto_auto_minmax(0,1fr)]"
            >
              <span />
              <span class="text-xs font-medium text-text-muted">
                Now
                <PencilLine
                  v-if="talentsEdited"
                  class="inline size-3.5 text-accent-text"
                  aria-label="Set by hand"
                  role="img"
                />
              </span>
              <span class="text-xs font-medium text-text-muted">Goal</span>
              <span class="hidden sm:block" />
              <template v-for="t in TALENTS" :key="t">
                <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
                  {{ TALENT_LABELS[t] }}
                  <span
                    v-if="boostOf(t)"
                    class="rounded px-1 font-mono text-[0.6875rem] font-medium"
                    :class="boostOf(t)!.on ? 'bg-accent/15 text-accent-text' : 'text-text-muted'"
                    :title="`C${boostOf(t)!.at} raises it by 3${boostOf(t)!.on ? ': in game ' + c.boosted.current[t] + ' → ' + c.boosted.target[t] : ''}`"
                    >C{{ boostOf(t)!.at }}</span
                  >
                </span>
                <NumberStepper
                  :model-value="c.current.talents[t]"
                  :min="c.captured.talents[t]"
                  :label="`${TALENT_LABELS[t]} now`"
                  @update:model-value="setNowTalent(t, $event)"
                />
                <NumberStepper
                  :model-value="stored.talents[t]"
                  :min="c.current.talents[t]"
                  :label="`${TALENT_LABELS[t]} goal`"
                  @update:model-value="setGoalTalent(t, $event)"
                />
                <span
                  class="tabular col-span-3 -mt-1 font-mono text-xs text-text-muted sm:col-span-1 sm:mt-0"
                  :class="boostOf(t)?.on ? '' : 'hidden sm:block'"
                  ><template v-if="boostOf(t)?.on"
                    >In game {{ c.boosted.current[t] }} → {{ c.boosted.target[t] }}</template
                  ></span
                >
              </template>
            </div>
          </section>

          <!-- Weapon -->
          <section v-else-if="tab === 'weapon'" class="flex flex-col gap-3" aria-label="Weapon">
            <WeaponGoalBlock
              v-for="w in entry.weapons"
              :key="w.goalId"
              :planner="planner"
              :weapon="w"
              :ar="ar"
              removable
              @target="emit('weapon', w, $event)"
              @now="emit('weaponNow', w, $event)"
              @remove="emit('removeWeapon', w)"
            />
            <WeaponChooser
              v-if="adding"
              :planner="planner"
              :good="good"
              :type="c.weapon"
              :holder="c.key"
              :names="names"
              @pick="pickWeapon"
            />
            <div class="flex gap-2">
              <UiButton v-if="!adding" @click="adding = true">
                <Plus class="size-4" aria-hidden="true" />
                Weapon
              </UiButton>
              <UiButton v-else variant="ghost" @click="adding = false">Cancel</UiButton>
            </div>
          </section>

          <!-- Artifacts -->
          <ArtifactGoalBlock
            v-else-if="tab === 'artifacts'"
            :goal="stored.artifacts"
            :worn="worn"
            :farming="farming"
            @change="setArtifacts"
          />

          <!-- Custom -->
          <section
            v-else-if="tab === 'custom' && c.custom"
            class="flex flex-col gap-4"
            aria-label="Custom character"
          >
            <CustomForm
              :planner="basePlanner"
              :profile="c.custom"
              @change="(custom) => setCharacter({ ...stored!, custom })"
            />
            <div class="flex flex-col gap-3 border-t border-border-subtle pt-3">
              <div class="flex flex-wrap items-center gap-2">
                <UiButton v-if="!replacing" @click="replacing = true">
                  <Replace class="size-4" aria-hidden="true" />
                  Replace with…
                </UiButton>
                <template v-else>
                  <UiButton variant="primary" :disabled="!replaceWith" @click="confirmReplace">
                    <Replace class="size-4" aria-hidden="true" />
                    {{ replaceWith ? `Replace with ${characterName(replaceWith)}` : 'Replace' }}
                  </UiButton>
                  <UiButton variant="ghost" @click="cancelReplace">Cancel</UiButton>
                </template>
              </div>
              <RosterGrid
                v-if="replacing"
                :planner="basePlanner"
                :good="good"
                :selected="replaceSelected"
                :exclude="taken"
                @toggle="(key) => (replaceWith = replaceWith === key ? null : key)"
              />
            </div>
          </section>

          <p
            v-if="gap"
            class="flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-warning-text"
            role="status"
          >
            <CircleAlert class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1"
              >{{ gap.talents.map((t) => TALENT_LABELS[t]).join(', ') }} need
              <span class="font-mono">{{ gapLabel }}</span></span
            >
            <UiButton size="sm" @click="fixGap">Set {{ gapLabel }}</UiButton>
          </p>

          <p
            class="tabular flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-text-muted"
          >
            <span v-if="!c.custom" title="The newest capture">Capture: {{ capturedText }}</span>
            <span v-if="c.edited" class="inline-flex items-center gap-1 text-accent-text">
              <PencilLine class="size-3.5" aria-hidden="true" />
              Set by hand
              <button
                type="button"
                class="inline-flex min-h-6 items-center gap-1 rounded px-1 hover:bg-surface-overlay"
                title="Back to the capture"
                @click="emit('characterNow', null)"
              >
                <RotateCcw class="size-3.5" aria-hidden="true" />
                Reset
              </button>
            </span>
          </p>
        </template>
      </div>

      <aside
        class="flex min-w-0 flex-col gap-3 lg:border-l lg:border-border-subtle lg:pl-5"
        aria-label="Cost"
      >
        <h3 class="text-sm font-semibold text-text-secondary">Cost</h3>
        <CostList
          :planner="planner"
          :requirements="requirements"
          :others="others"
          :inventory="good.materials"
          :options="options"
          :label="title"
          legend
        />
        <p
          v-if="estimate"
          class="tabular font-mono text-sm text-text-secondary"
          :title="estimate.title"
        >
          {{ estimate.text }}<span class="sr-only"> ({{ estimate.title }})</span>
        </p>
      </aside>
    </div>
  </UiModal>
</template>
