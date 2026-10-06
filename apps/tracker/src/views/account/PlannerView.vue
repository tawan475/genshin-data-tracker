<script setup lang="ts">
import { craftingSteps } from '@gdt/game-data/planner-convert'
import { farmPlan, resinNow } from '@gdt/game-data/planner-estimate'
import {
  NEW_CHARACTER,
  findCharacterState,
  findWeaponState,
  itemGoal,
  type CharacterState,
  type PlanGoal,
  type Requirement,
  type WeaponState,
} from '@gdt/game-data/planner-math'
import type {
  CharacterCurrent,
  CharacterTarget,
  CustomCharacter,
  PlannerTarget,
  WeaponCurrent,
  WeaponTarget,
} from '@gdt/shared'
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CheckSquare,
  Clock,
  Eye,
  EyeOff,
  FileInput,
  Info,
  Plus,
  SearchX,
  Settings2,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'
import DoneDialog from '@/components/planner/DoneDialog.vue'
import ExtraItems from '@/components/planner/ExtraItems.vue'
import FarmPanel from '@/components/planner/FarmPanel.vue'
import GoalCard from '@/components/planner/GoalCard.vue'
import GoalModal from '@/components/planner/GoalModal.vue'
import GoalPicker from '@/components/planner/GoalPicker.vue'
import GoalToolbar from '@/components/planner/GoalToolbar.vue'
import ItemEditor from '@/components/planner/ItemEditor.vue'
import ItemPopover from '@/components/planner/ItemPopover.vue'
import PlannerSettings from '@/components/planner/PlannerSettings.vue'
import ResinTracker from '@/components/planner/ResinTracker.vue'
import TasksStrip from '@/components/planner/TasksStrip.vue'
import {
  allocateNeeds,
  createAllocationMemo,
  moveTo,
  reprioritize,
} from '@/components/planner/allocation'
import { newCustomKey, replaceCustom } from '@/components/planner/custom-character'
import { costChanges, doneCost, type DoneCost, type DonePart } from '@/components/planner/done'
import { READINESS } from '@/components/planner/farm-format'
import { farmDay, type ArtifactWant } from '@/components/planner/farm-today'
import { provideGoalActions } from '@/components/planner/goal-actions'
import {
  GOAL_SORTS,
  NO_GOAL_FILTERS,
  entryStatuses,
  filterGoals,
  filterItems,
  goalFacetCounts,
  sortGoals,
  type GoalFilters,
  type GoalSort,
} from '@/components/planner/goal-list'
import { characterNow, weaponNow } from '@/components/planner/hand-edits'
import { provideItemPopover, type ItemRequest } from '@/components/planner/item-popover'
import {
  allocationOrder,
  characterGoalId,
  characterInput,
  characterName,
  customGoalId,
  defaultWeaponTarget,
  entryGoal,
  entryInputs,
  entryRefs,
  inputOf,
  itemGoalId,
  newGoalId,
  nextHint,
  parseGoalId,
  shortCount,
  targetId,
  weaponGoalId,
  weaponInput,
  withoutPassives,
  type EditorSubject,
  type GoalEntry,
  type ItemGoalView,
  type NextHint,
  type TargetRef,
  type WeaponGoalView,
} from '@/components/planner/model'
import type { GoalNeeds } from '@/components/planner/needs'
import { PRESETS, applyPreset, presetById, type PresetId } from '@/components/planner/presets'
import { resinAt, resinReading } from '@/components/planner/resin'
import type { SeelieWrites } from '@/components/planner/seelie-plan'
import { upsertTask } from '@/components/planner/use-planner-tasks'
import { saveTraveler, travelerGender } from '@/data/traveler'
import { ApiRequestError } from '@/api'
import { useAccounts } from '@/stores/accounts'
import { keepUnchangedValues } from '@/components/planner/keep-unchanged'
import { useDragOrder } from '@/components/planner/use-drag-order'
import { useProgressive } from '@/components/planner/use-progressive'
import type { CurrentChange } from '@/components/planner/use-planner-state'
import { usePlannerModel } from '@/components/planner/use-planner-model'
import { remove, upsert } from '@/components/planner/use-planner-targets'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/**
 * Planner: goals per character (level, ascension, talents) and weapon, extra
 * item needs, what they cost from the current state, and what is still
 * missing against the bag (crafting, Dream Solvent, optionally Dust of
 * Azoth and forging, Mora passives), with runs, resin and days per source
 * from the account's AR and World Level.
 *
 * The bag and the current states are the newest capture's with the hand
 * edits on top (hand-edits.ts): every material icon edits its count, a Done
 * spends a part's materials and sets its state, and a newer capture replaces
 * the edits (irminsul is the truth). Without any capture the bag starts
 * empty, so the planner works from what is typed in. Goals, edits and the
 * planner settings live on the server; other tabs and devices follow live.
 *
 * Goals are edited in one modal per card that saves as you go (GoalModal),
 * added several at a time with a preset (GoalPicker), changed in bulk, and
 * ordered by priority: the bag goes to the goals at the top first, so a
 * card is ready when it is covered after the ones above it (allocation.ts).
 */
const account = useAccount()
const route = useRoute()
const router = useRouter()
const feedback = useFeedback()
const accounts = useAccounts()

const {
  accountId,
  resource,
  data,
  planner,
  basePlanner,
  good,
  drops,
  farming,
  hasCapture,
  store,
  state,
  bag,
  goodView,
  replaced,
  settings,
  saveSettings,
  tasks,
  player,
  ar,
  wl,
  forge,
  passiveOwners,
  planOptions,
  requirementCache,
  board,
  totals,
  setCount,
  addCount,
} = usePlannerModel(account, { tasks: true })
const settingsOpen = ref(false)

const plan = computed(() =>
  planner.value && totals.value
    ? farmPlan(planner.value, totals.value, drops.value, {
        ar: ar.value,
        wl: wl.value,
      })
    : null,
)
const steps = computed(() =>
  planner.value && totals.value ? craftingSteps(planner.value, totals.value) : [],
)

// A clock for today's domains, the reset countdown and the resin estimate.
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => clearInterval(clock))
/**
 * Dev only: `?at=2026-10-04T12:00:00Z` (or ms) pins the farm clock, to see
 * another server day (Sunday, a reset) without waiting for it.
 */
const pinned = computed(() => {
  if (!import.meta.env.DEV) return null
  const raw = route.query.at
  if (typeof raw !== 'string' || raw === '') return null
  const at = /^\d+$/.test(raw) ? Number(raw) : Date.parse(raw)
  return Number.isFinite(at) ? at : null
})
const day = computed(() => farmDay(pinned.value ?? now.value, account.value.server))
/** The capture's resin: irminsul's at login, else the snapshot's count. */
const resin = computed(() => {
  const at = account.value.latest?.takenAt
  return planner.value && bag.value && at !== undefined && hasCapture.value
    ? resinNow(planner.value, bag.value, at, now.value, player.value.resin)
    : null
})
/** The resin to count from: the capture's, or one set by hand after it. */
const reading = computed(() => resinReading(resin.value, settings.value.resin))
/** Original Resin now plus the bag's resin items (the farm headline's days). */
const resinHeld = computed(() => {
  const r = reading.value
  return r ? resinAt(r, now.value) + (resin.value?.bag ?? 0) : null
})
/** Condensed Resin held, and the most one can hold. */
const condensed = computed(() => {
  const c = planner.value?.resin.condensed
  return { count: c?.key ? Math.max(0, bag.value?.[c.key] ?? 0) : 0, max: c?.max ?? 0 }
})
const plannerUrl = computed(
  () => router.resolve({ name: 'account-planner', params: { accountId: account.value.id } }).href,
)
const accountLabel = computed(() => account.value.name ?? account.value.uid ?? 'Genshin account')

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Each card's cost as one goal (a character with its weapons). Kept per
 * card while its parts' costs are the same objects (the requirement cache
 * hands back the same one for the same numbers), so a note or a favourite
 * doesn't recost every card.
 */
let goalMemo = {
  planner: null as object | null,
  owners: null as object | null,
  map: new Map<string, { parts: (Requirement | null)[]; goal: PlanGoal | null }>(),
}
const entryGoals = computed(() => {
  const map = new Map<string, PlanGoal>()
  const p = planner.value
  if (!p || !board.value) return map
  const owners = passiveOwners.value
  if (goalMemo.planner !== p || goalMemo.owners !== owners) {
    goalMemo = { planner: p, owners, map: new Map() }
  }
  const next = new Map<string, { parts: (Requirement | null)[]; goal: PlanGoal | null }>()
  for (const entry of board.value.entries) {
    const parts = [entry.character?.requirement ?? null, ...entry.weapons.map((w) => w.requirement)]
    const seen = goalMemo.map.get(entry.id)
    const goal = seen && sameList(seen.parts, parts) ? seen.goal : entryGoal(p, entry, owners)
    next.set(entry.id, { parts, goal })
    if (goal) map.set(entry.id, goal)
  }
  goalMemo.map = next
  return map
})

/** Cards in priority order: the bag goes to the first ones first. */
const order = computed(() => allocationOrder(board.value?.entries ?? []))

/**
 * Per card: ready after the counted cards above it, ready alone, or short,
 * and the materials it is short of (allocation.ts). Recomputed only when a
 * card's cost, its place or its counting changes, or the bag does.
 */
let needsMemo = { key: [] as unknown[], map: new Map<string, GoalNeeds>() }
/** What allocation kept from the last time (each goal's own totals, the goals above a change). */
const allocationMemo = createAllocationMemo()
const needs = computed(() => {
  const p = planner.value
  const b = bag.value
  if (!board.value || !p || !b) return new Map<string, GoalNeeds>()
  const options = withoutPassives(planOptions.value)
  const items = order.value.map((e) => ({
    id: e.id,
    goal: e.materialsDone ? null : (entryGoals.value.get(e.id) ?? null),
    active: e.active,
  }))
  const key = [
    p,
    b,
    `${options.azoth}|${options.forge}`,
    ...items.flatMap((i) => [i.id, i.goal, i.active]),
  ]
  if (sameList(needsMemo.key, key)) return needsMemo.map
  // A card whose needs are the same keeps the object: it doesn't re-render.
  needsMemo = {
    key,
    map: keepUnchangedValues(needsMemo.map, allocateNeeds(p, items, b, options, allocationMemo)),
  }
  return needsMemo.map
})

/** Counted goals the bag covers on their own: what can be levelled right now. */
const ready = computed(() => {
  const set = new Set<string>()
  for (const entry of board.value?.entries ?? []) {
    const status = needs.value.get(entry.id)?.status
    if (entry.active && status && status !== 'short') set.add(entry.id)
  }
  return set
})

/** Per card, how many materials it is short of on its own (for the "Missing" sort). */
const missing = computed(() => {
  const map = new Map<string, number>()
  for (const [id, n] of needs.value) {
    map.set(id, n.chips.filter((c) => c.status === 'short').length)
  }
  return map
})

/**
 * What each card can level now, when that is only part of its goal. Kept per
 * goal state for one bag and set of options, so a favorite toggle doesn't
 * recompute them all.
 */
let hintMemo = {
  inventory: null as object | null,
  options: '',
  planner: null as object | null,
  map: new Map<string, NextHint | null>(),
}
/** What a card can level now (only for the cards shown: 100 goals mount a few at a time). */
function hintOf(entry: GoalEntry): NextHint | null {
  const p = planner.value
  const b = bag.value
  if (!p || !b) return null
  if (entry.materialsDone || missing.value.get(entry.id) === 0) return null
  const o = planOptions.value
  const optionsKey = JSON.stringify([o.azoth, !!o.passives, o.forge, ar.value])
  if (hintMemo.inventory !== b || hintMemo.options !== optionsKey || hintMemo.planner !== p) {
    hintMemo = { inventory: b, options: optionsKey, planner: p, map: new Map() }
  }
  const c = entry.character
  const key = JSON.stringify([
    entry.id,
    c ? [c.current, c.target.level, c.target.ascension, c.target.talents] : null,
    entry.weapons.map((w) => [w.goalId, w.current, w.target.level, w.target.ascension]),
  ])
  let hint = hintMemo.map.get(key)
  if (hint === undefined) {
    hint = nextHint(p, entry, b, { ...o, ar: ar.value })
    hintMemo.map.set(key, hint)
  }
  return hint
}

/** Artifact sets the counted character goals still want (Today's artifact domains). */
const artifactWants = computed<ArtifactWant[]>(() =>
  (board.value?.entries ?? []).flatMap((e) => {
    const c = e.character
    const open = c?.target.active ? (c.artifacts?.open ?? []) : []
    return c && open.length && !c.artifacts?.complete ? [{ goal: c.id, sets: open }] : []
  }),
)

/** Extra item needs the bag covers on their own. */
const itemsInStock = computed(() => {
  const set = new Set<string>()
  const p = planner.value
  const b = bag.value
  if (!p || !b) return set
  for (const item of board.value?.items ?? []) {
    const goal = itemGoal(p, item.key, item.target)
    if (shortCount(p, goal, b, planOptions.value) === 0) set.add(item.id)
  }
  return set
})

// ------------------------------------------------------------------ tabs

type Tab = 'farm' | 'goals'
const TABS: { value: Tab; label: string }[] = [
  { value: 'farm', label: 'Farm' },
  { value: 'goals', label: 'Goals' },
]
const tab = ref<Tab>(readStorage('planner:tab') === 'goals' ? 'goals' : 'farm')
watch(tab, (value) => writeStorage('planner:tab', value))

type FarmView = 'today' | 'schedule'
const farmView = ref<FarmView>(readStorage('planner:farm') === 'schedule' ? 'schedule' : 'today')
watch(farmView, (value) => writeStorage('planner:farm', value))

// ------------------------------------------------------------------ goals

const filters = reactive<GoalFilters>({ ...NO_GOAL_FILTERS })
const filtered = computed(
  () =>
    filters.query.trim() !== '' ||
    filters.status !== 'all' ||
    filters.element !== 'all' ||
    filters.rarity !== 'all' ||
    filters.weaponType !== 'all',
)
function clearFilters() {
  Object.assign(filters, NO_GOAL_FILTERS)
}

const savedSort = readStorage('planner:sort')
const sort = ref<GoalSort>(
  GOAL_SORTS.some((s) => s.value === savedSort) ? (savedSort as GoalSort) : 'name',
)
watch(sort, (value) => writeStorage('planner:sort', value))
const showDone = ref(false)

const entries = computed(() => board.value?.entries ?? [])
const matching = computed(() => filterGoals(entries.value, filters, ready.value))
const pendingEntries = computed(() => {
  if (sort.value !== 'priority') {
    return sortGoals(
      matching.value.filter((e) => !e.done),
      sort.value,
      missing.value,
    )
  }
  const shown = new Set(matching.value.map((e) => e.id))
  return order.value.filter((e) => !e.done && shown.has(e.id))
})
const doneEntries = computed(() => matching.value.filter((e) => e.done))
/** The cards mounted so far: the first ones at once, the rest over the next frames. */
const progressive = useProgressive(
  computed(() => pendingEntries.value.length),
  6,
  6,
)
const shownPending = computed(() => pendingEntries.value.slice(0, progressive.shown.value))
/**
 * The views shown so far. Once shown, a view stays mounted (hidden): going
 * back is a display switch, not a remount of 100 cards (and unmounting the
 * other's), which took a slow phone well over 100 ms.
 */
const seen = reactive({ farm: false, goals: false })
watch(
  tab,
  (value) => {
    if (seen[value]) return
    seen[value] = true
    // First shown now: its cards mount from the first ones again.
    if (value === 'goals') progressive.restart()
  },
  { immediate: true },
)
const shownItems = computed(() =>
  filterItems(board.value?.items ?? [], filters, (i) => itemsInStock.value.has(i.id)),
)

const statusCounts = computed(() =>
  goalFacetCounts(entries.value, filters, ready.value, 'status', (e) =>
    entryStatuses(e, ready.value),
  ),
)
const elementCounts = computed(() =>
  goalFacetCounts(entries.value, filters, ready.value, 'element', (e) => e.element),
)
const rarityCounts = computed(() =>
  goalFacetCounts(entries.value, filters, ready.value, 'rarity', (e) => e.rarity),
)
const rarities = computed(() => {
  const set = new Set<number>([5, 4])
  for (const e of entries.value) if (e.rarity) set.add(e.rarity)
  return [...set].sort((a, b) => b - a)
})

function toggleActive(entry: GoalEntry) {
  store.change(entryInputs(entry, { active: !entry.active }).map(upsert))
}

function toggleFavorite(entry: GoalEntry) {
  const c = entry.character
  if (!c) return
  const favorite = entry.favorite ? undefined : true
  store.change([upsert(characterInput(c, { ...c.stored, favorite }))])
}

function toggleItem(item: ItemGoalView) {
  const target = { ...item.target, active: !item.target.active }
  store.change([upsert({ kind: 'item', key: item.key, target })])
}

// ------------------------------------------------------------ priority order

/** Pending cards in priority order (the done ones keep their place). */
const pendingOrder = computed(() => order.value.filter((e) => !e.done).map((e) => e.id))
/** Each pending card's place, 1 first. */
const ranks = computed(() => new Map(pendingOrder.value.map((id, i) => [id, i + 1])))

/** Stores an order as priorities 1, 2, 3… (only the cards whose number changes). */
function applyOrder(ids: string[]) {
  const byId = new Map(order.value.map((e) => [e.id, e]))
  const changes = reprioritize(ids, new Map(ids.map((id) => [id, byId.get(id)?.priority ?? null])))
  const ops = [...changes].flatMap(([id, priority]) => {
    const e = byId.get(id)
    if (!e) return []
    if (e.character)
      return [upsert(characterInput(e.character, { ...e.character.stored, priority }))]
    const w = e.weapons[0]
    return w ? [upsert(weaponInput(w, { ...w.target, priority }))] : []
  })
  if (ops.length) store.change(ops)
}

const drag = useDragOrder({
  move: (id, to) => applyOrder(moveTo(pendingOrder.value, id, to)),
  // Keys move among the cards shown (filters may hide some).
  step: (id, by) => {
    const shown = pendingEntries.value.map((e) => e.id)
    const at = shown.indexOf(id)
    if (at < 0) return
    const to = by === 'start' ? 0 : by === 'end' ? shown.length - 1 : at + by
    const target = shown[Math.max(0, Math.min(shown.length - 1, to))]
    if (target && target !== id) applyOrder(moveTo(pendingOrder.value, id, target))
  },
})
const sorting = computed(() => sort.value === 'priority' && !selecting.value)
/** Each card's last place object: the same one while it doesn't change (no re-render). */
const orderObjects = new Map<string, { rank: number; dragging: boolean; over: boolean }>()
function orderOf(entry: GoalEntry) {
  if (!sorting.value) return null
  const next = {
    rank: ranks.value.get(entry.id) ?? 0,
    dragging: drag.dragging.value === entry.id,
    over: drag.over.value === entry.id,
  }
  const old = orderObjects.get(entry.id)
  if (old && old.rank === next.rank && old.dragging === next.dragging && old.over === next.over) {
    return old
  }
  orderObjects.set(entry.id, next)
  return next
}

// ------------------------------------------------------------------ bulk

const selecting = ref(false)
const picked = ref<Set<string>>(new Set())
watch(selecting, (on) => {
  if (!on) picked.value = new Set()
})
function togglePicked(id: string) {
  const next = new Set(picked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked.value = next
}
const pickedEntries = computed(() => entries.value.filter((e) => picked.value.has(e.id)))
const allPicked = computed(
  () =>
    pendingEntries.value.length > 0 && pendingEntries.value.every((e) => picked.value.has(e.id)),
)
function pickAll() {
  picked.value = allPicked.value ? new Set() : new Set(pendingEntries.value.map((e) => e.id))
}
const bulkPreset = ref<PresetId | ''>('')
const presetChoices = [
  { value: '' as const, label: 'Preset' },
  ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
]

/** Stored targets of some cards, for an Undo. */
function snapshotOf(list: readonly GoalEntry[]): PlannerTarget[] {
  const ids = new Set(list.flatMap((e) => entryRefs(e).map((r) => targetId(r))))
  return (store.targets.value ?? []).filter((t) => ids.has(targetId(t)))
}

function undoToast(title: string, before: PlannerTarget[]) {
  feedback.toast({
    tone: 'info',
    title,
    action: { label: 'Undo', run: () => store.change(before.map((t) => upsert(inputOf(t)))) },
  })
}

watch(bulkPreset, (id) => {
  if (!id) return
  bulkPreset.value = ''
  const preset = presetById(id)
  const p = planner.value
  if (!preset || !p) return
  const list = pickedEntries.value.filter((e) => e.character)
  if (list.length === 0) return
  const before = snapshotOf(list)
  store.change(
    list.map((e) => {
      const c = e.character!
      const phases = p.characters.get(c.key)?.ascension
      return upsert(characterInput(c, applyPreset(preset, c.current, c.stored, phases)))
    }),
  )
  undoToast(`${preset.label}: ${formatNumber(list.length)} goals`, before)
})

function bulkActive(active: boolean) {
  const list = pickedEntries.value
  if (list.length === 0) return
  const before = snapshotOf(list)
  store.change(list.flatMap((e) => entryInputs(e, { active }).map(upsert)))
  undoToast(`${formatNumber(list.length)} ${active ? 'counted' : 'paused'}`, before)
}

function bulkRemove() {
  const list = pickedEntries.value
  if (list.length === 0) return
  void removeGoals(list.flatMap(entryRefs), `${formatNumber(list.length)} goals removed`)
  selecting.value = false
}

// ------------------------------------------------------------ farm cards
// A portrait on a farm card opens its goal; a long press or right click pauses it.

/** The card a goal is on (a weapon goal's: its holder's card when there is one). */
function entryFor(s: EditorSubject | null): GoalEntry | null {
  if (!s) return null
  const list = board.value?.entries ?? []
  if (s.kind === 'character') {
    return list.find((e) => e.character?.id === characterGoalId(s.key)) ?? null
  }
  if (s.kind === 'custom') return list.find((e) => e.character?.id === customGoalId(s.key)) ?? null
  if (s.kind === 'weapon') return list.find((e) => e.weapons.some((w) => w.goalId === s.id)) ?? null
  return null
}

function openGoal(id: string) {
  const s = parseGoalId(id)
  if (s?.kind === 'item') {
    openEditor(id)
    return
  }
  const entry = entryFor(s)
  if (entry) openEntry(entry)
}

/** Stops counting a goal's card (a character with its weapons; an item need), with an Undo. */
function pauseGoal(id: string) {
  const entry = id.startsWith('item:') ? null : entryFor(parseGoalId(id))
  const ids = new Set(
    entry ? [entry.character?.id, ...entry.weapons.map((w) => w.id)].filter(Boolean) : [id],
  )
  const before = (store.targets.value ?? []).filter(
    (t) => ids.has(targetId(t)) && t.target.active !== false,
  )
  if (before.length === 0) return
  const paused = (t: PlannerTarget) =>
    upsert({ ...inputOf(t), target: { ...t.target, active: false } } as Parameters<
      typeof upsert
    >[0])
  store.change(before.map(paused))
  const name = entry?.name ?? board.value?.items.find((i) => i.id === id)?.name ?? before[0]!.key
  feedback.toast({
    tone: 'info',
    title: `${name} paused`,
    action: { label: 'Undo', run: () => store.change(before.map((t) => upsert(inputOf(t)))) },
  })
}

const favorites = computed<ReadonlySet<string>>(
  () =>
    new Set(
      (board.value?.entries ?? []).flatMap((e) =>
        e.favorite && e.character ? [e.character.key] : [],
      ),
    ),
)
/** Custom characters' names by id (portraits, weapon holders). */
const customNames = computed<ReadonlyMap<string, string>>(
  () =>
    new Map(
      [...(board.value?.characterGoals.values() ?? [])].flatMap((c) =>
        c.custom ? [[c.key, c.name] as const] : [],
      ),
    ),
)
provideGoalActions({ open: openGoal, pause: pauseGoal, favorites, names: customNames })

// ------------------------------------------------------------ inventory

/** The inventory editor every material icon opens (one for the page). */
const itemRequest = shallowRef<ItemRequest | null>(null)
const itemOpen = ref(false)
provideItemPopover((request) => {
  itemRequest.value = request
  itemOpen.value = true
})

// ------------------------------------------------------------------ done

interface DoneRequest {
  entry: GoalEntry
  part: DonePart
  cost: DoneCost
  label: string
  from: string
  to: string
}
const doneRequest = shallowRef<DoneRequest | null>(null)
const doneOpen = ref(false)
const doneSaving = ref(false)

function askDone(
  entry: GoalEntry,
  part: DonePart,
  text: { label: string; from: string; to: string },
) {
  const p = planner.value
  const b = bag.value
  if (!p || !b) return
  const cost = doneCost(p, part.requirement, b, planOptions.value)
  doneRequest.value = { entry, part, cost, ...text }
  doneOpen.value = true
}

function stateChange(part: DonePart, current: DonePart['next']['current'] | null): CurrentChange {
  const next = part.next
  return next.kind === 'weapon'
    ? {
        kind: 'weapon',
        id: next.id,
        key: next.key,
        owner: next.owner,
        current: current as WeaponCurrent | null,
      }
    : { kind: next.kind, key: next.key, current: current as CharacterCurrent | null }
}

async function confirmDone() {
  const request = doneRequest.value
  if (!request) return
  const { part, cost } = request
  /** The state set by hand before, for Undo (null: none). */
  const previous = state.overrides.value?.get(part.goal) ?? null
  doneSaving.value = true
  try {
    await state.commit({
      inventory: costChanges(cost),
      current: [stateChange(part, part.next.current)],
    })
  } catch {
    // Said by the store (a newer capture, or not saved).
    doneOpen.value = false
    return
  } finally {
    doneSaving.value = false
  }
  doneOpen.value = false
  feedback.toast(
    {
      tone: 'success',
      title: `${request.entry.name}: ${request.label} done`,
      hint: `${request.from} → ${request.to}`,
      action: {
        label: 'Undo',
        run: () =>
          void state
            .commit({
              inventory: costChanges(cost, true),
              current: [stateChange(part, previous)],
            })
            .catch(() => {}),
      },
    },
    8000,
  )
}

// ------------------------------------------------------------------ editor
// The open goal lives in the URL (?goal=character:HuTao): Back closes it.

const subject = computed(() => parseGoalId(route.query.goal))
const itemKey = computed(() => (subject.value?.kind === 'item' ? subject.value.key : null))
/** The card the goal editor is open on (null: none, or one that is gone). */
const editorEntry = computed(() =>
  subject.value?.kind === 'item' ? null : entryFor(subject.value),
)
let pushed = false
watch(subject, (value) => {
  if (value === null) pushed = false
})

function openEditor(goalId: string) {
  const query = { ...route.query, goal: goalId }
  if (subject.value !== null) void router.replace({ query })
  else {
    pushed = true
    void router.push({ query })
  }
}

function closeEditor() {
  if (pushed) {
    pushed = false
    router.back()
    return
  }
  const query = { ...route.query }
  delete query.goal
  void router.replace({ query })
}

/** The tab the editor opens on (a card's Artifacts row); null: the last one used. */
const editorTab = ref<'artifacts' | null>(null)
function openEntry(entry: GoalEntry, tab: 'artifacts' | null = null) {
  editorTab.value = tab
  openEditor(entry.id)
}

const editorItem = computed(() => {
  const key = itemKey.value
  return key ? (board.value?.items.find((i) => i.key === key)?.target ?? null) : null
})
/** Every goal but the open card's (or item's), for its cost colours. */
const editorOthers = computed<PlanGoal[]>(() => {
  const goals = board.value?.goals ?? []
  const mine = new Set<string>()
  const e = editorEntry.value
  if (e?.character) mine.add(e.character.id)
  for (const w of e?.weapons ?? []) mine.add(w.id)
  if (itemKey.value) mine.add(itemGoalId(itemKey.value))
  return goals.filter((g) => !mine.has(g.id))
})

/** Character keys with a goal (what "Replace with" leaves out). */
const takenCharacters = computed(
  () =>
    new Set((store.targets.value ?? []).flatMap((t) => (t.kind === 'character' ? [t.key] : []))),
)

type Ops = Parameters<typeof store.commit>[0]

/** Item editor: goals first, then closes. */
async function save(ops: Ops) {
  try {
    await store.commit(ops)
    closeEditor()
  } catch {
    // The stores already said what went wrong and reloaded.
  }
}

/** A stored goal's hand-set current state, as the change that puts it back. */
function currentOf(t: PlannerTarget): CurrentChange | null {
  const current = state.overrides.value?.get(targetId(t))
  if (!current) return null
  if (t.kind === 'weapon') {
    return {
      kind: 'weapon',
      id: t.id,
      key: t.key,
      owner: t.owner,
      current: current as WeaponCurrent,
    }
  }
  if (t.kind === 'item') return null
  return { kind: t.kind, key: t.key, current: current as CharacterCurrent }
}

/** Removes goals now, with an Undo that puts them back with their hand-set states. */
async function removeGoals(refs: TargetRef[], title: string) {
  const ids = new Set(refs.map((r) => targetId(r)))
  const removed = (store.targets.value ?? []).filter((t) => ids.has(targetId(t)))
  const states = removed.flatMap((t) => currentOf(t) ?? [])
  try {
    await store.commit(refs.map(remove))
  } catch {
    return // Reported by the store.
  }
  feedback.toast(
    {
      tone: 'info',
      title,
      action: {
        label: 'Undo',
        run: () =>
          void (async () => {
            await store.commit(removed.map((t) => upsert(inputOf(t))))
            if (states.length) await state.commit({ current: states })
          })().catch(() => {}),
      },
    },
    8000,
  )
}

/** The item editor's remove (one item need). */
async function removeItem(ops: Ops) {
  const refs = ops.flatMap((op) => (op.kind === 'remove' ? [op.ref] : []))
  closeEditor()
  await removeGoals(refs, 'Item removed')
}

// The modal saves as you go: each change is written at once (sent after a short pause).

function writeCharacter(target: CharacterTarget & { custom?: CustomCharacter }) {
  const c = editorEntry.value?.character
  if (c) store.change([upsert(characterInput(c, target))])
}

function writeCharacterNow(next: CharacterState | null) {
  const c = editorEntry.value?.character
  if (!c) return
  // Back to no hand-set state where the capture already says as much.
  const current =
    next && characterNow(c.captured, next).edited
      ? { level: next.level, ascension: next.ascension, talents: { ...next.talents } }
      : null
  state.change({ current: [{ kind: c.custom ? 'custom' : 'character', key: c.key, current }] })
}

function writeWeapon(w: WeaponGoalView, target: WeaponTarget) {
  store.change([upsert(weaponInput(w, target))])
}

function writeWeaponNow(w: WeaponGoalView, next: WeaponState | null) {
  const current = next && weaponNow(w.captured, next).edited ? { ...next } : null
  state.change({
    current: [{ kind: 'weapon', id: w.goalId, key: w.key, owner: w.owner, current }],
  })
}

function addWeaponGoal(key: string) {
  const c = editorEntry.value?.character
  const p = planner.value
  const g = goodView.value
  if (!c || !p || !g) return
  const start = findWeaponState(g.weapons, key, c.key).state
  store.change([
    upsert({
      kind: 'weapon',
      id: newGoalId(),
      key,
      owner: c.key,
      target: defaultWeaponTarget(p, key, start),
    }),
  ])
}

function removeWeaponGoal(w: WeaponGoalView) {
  void removeGoals(
    [{ kind: 'weapon', key: w.key, owner: w.owner, id: w.goalId }],
    `${w.name} removed`,
  )
}

function removeEntry() {
  const e = editorEntry.value
  if (!e) return
  closeEditor()
  void removeGoals(entryRefs(e), `${e.name} removed`)
}

async function replaceWith(real: string) {
  const e = editorEntry.value
  const c = e?.character
  if (!e || !c?.custom) return
  const stored = (store.targets.value ?? []).find((t) => t.kind === 'custom' && t.key === c.key)
  if (stored?.kind !== 'custom') return
  const override = (state.overrides.value?.get(c.id) as CharacterCurrent | undefined) ?? null
  const r = replaceCustom(
    c.key,
    stored.target,
    real,
    e.weapons.map((w) => ({ goalId: w.goalId, key: w.key, target: w.target })),
    override,
  )
  try {
    await store.commit([...r.remove.map(remove), ...r.upsert.map(upsert)])
    if (r.current.length) await state.commit({ current: r.current })
  } catch {
    return // Reported by the stores.
  }
  openEditor(characterGoalId(real))
  feedback.toast({ tone: 'success', title: `${c.name} → ${characterName(real)}` })
}

// ------------------------------------------------------------- add, import

const pickerOpen = ref(false)
const pickerStart = ref<'item' | null>(null)
const importOpen = ref(false)
const importing = ref(false)
/** The Seelie dialog (and its slug tables) load the first time it opens. */
const SeelieImport = defineAsyncComponent(() => import('@/components/planner/SeelieImport.vue'))
const seelieShown = ref(false)
watch(importOpen, (open) => {
  if (open) seelieShown.value = true
})
const taken = computed(() => new Set((store.targets.value ?? []).map((t) => targetId(t))))

function openPicker(start: 'item' | null = null) {
  pickerStart.value = start
  pickerOpen.value = true
}

/** New goals from the picker; the card of a single one opens. */
async function addGoals(ops: Ops, open: string | null, title: string) {
  try {
    await store.commit(ops)
  } catch {
    return // Reported by the store.
  }
  pickerOpen.value = false
  tab.value = 'goals'
  if (open) openEditor(open)
  else feedback.toast({ tone: 'success', title })
}

function addCharacters(keys: string[], presetId: PresetId) {
  const p = basePlanner.value
  const g = goodView.value
  const preset = presetById(presetId)
  if (!p || !g || !preset || keys.length === 0) return
  const ops = keys.map((key) =>
    upsert({
      kind: 'character',
      key,
      target: applyPreset(
        preset,
        findCharacterState(g.characters, key).state,
        {},
        p.characters.get(key)?.ascension,
      ),
    }),
  )
  void addGoals(
    ops,
    keys.length === 1 ? characterGoalId(keys[0]!) : null,
    `Added ${formatNumber(keys.length)} goals`,
  )
}

function addWeapon(key: string, owner: string) {
  const p = planner.value
  const g = goodView.value
  if (!p || !g) return
  const id = newGoalId()
  const target = defaultWeaponTarget(p, key, findWeaponState(g.weapons, key, owner).state)
  void addGoals(
    [upsert({ kind: 'weapon', id, key, owner, target })],
    weaponGoalId(key, owner, id),
    '',
  )
}

function addCustom(custom: CustomCharacter, presetId: PresetId) {
  const preset = presetById(presetId)
  const p = planner.value
  if (!preset || !p) return
  const key = newCustomKey()
  const target = { ...applyPreset(preset, NEW_CHARACTER), custom }
  void addGoals([upsert({ kind: 'custom', key, target })], customGoalId(key), '')
}

function addItem(key: string) {
  pickerOpen.value = false
  openEditor(itemGoalId(key))
}

/** A Seelie import: goals first (current states land on stored goals), then the rest. */
async function importSeelie(writes: SeelieWrites) {
  importing.value = true
  try {
    if (writes.targets.length) await store.commit(writes.targets)
    if (writes.current.length || writes.inventory.length) {
      await state.commit({ current: writes.current, inventory: writes.inventory })
    }
    if (writes.tasks.length && tasks) await tasks.commit(writes.tasks.map(upsertTask))
    const patch = { ...writes.settings, ...(writes.resin ? { resin: writes.resin } : {}) }
    if (Object.keys(patch).length) await saveSettings(patch)
    if (writes.traveler) await saveTraveler(account.value.id, writes.traveler)
    if (writes.server) await accounts.update(account.value.id, { server: writes.server })
  } catch (cause) {
    // The stores say what went wrong; the rest (settings, account) here.
    if (!(cause instanceof ApiRequestError)) feedback.error('Not imported', cause)
    return
  } finally {
    importing.value = false
  }
  importOpen.value = false
  const goals = writes.targets.filter((op) => op.kind === 'upsert').length
  const parts = [
    goals && `${formatNumber(goals)} goals`,
    writes.current.length && `${formatNumber(writes.current.length)} current`,
    writes.inventory.length && `${formatNumber(writes.inventory.length)} items`,
    writes.tasks.length && `${formatNumber(writes.tasks.length)} tasks`,
  ].filter(Boolean)
  feedback.toast({
    tone: 'success',
    title: 'Imported from Seelie',
    ...(parts.length ? { detail: parts.join(' · ') } : {}),
  })
  tab.value = 'farm'
}

/** Downloads the planner as a Seelie account file (goals, inventory, tasks, resin, settings). */
async function exportSeelie() {
  const p = planner.value
  const b = board.value
  const g = good.value
  if (!p || !b || !g || !bag.value) return
  const now = Date.now()
  const r = reading.value
  let module: typeof import('@/data/seelie-export')
  try {
    module = await import('@/data/seelie-export')
  } catch (cause) {
    feedback.error('Not exported', cause)
    return
  }
  const { buildSeelieExport, seelieExportFileName } = module
  const file = buildSeelieExport({
    planner: p,
    targets: store.targets.value ?? [],
    characterNow: (kind, key) =>
      b.characterGoals.get(kind === 'custom' ? customGoalId(key) : characterGoalId(key))?.current ??
      findCharacterState(g.characters, key).state,
    weaponNow: (w) =>
      b.weaponGoals.get(weaponGoalId(w.key, w.owner, w.id))?.current ??
      findWeaponState(g.weapons, w.key, w.owner).state,
    constellation: (key) => b.characterGoals.get(characterGoalId(key))?.constellation ?? 0,
    bag: bag.value,
    tasks: tasks?.tasks.value ?? [],
    // The reading itself: Seelie regenerates from it the same way.
    resin: r ? { value: r.value, at: r.at } : null,
    settings: { ar: ar.value, wl: wl.value, traveler: travelerGender.value },
    server: account.value.server,
    now,
  })
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = seelieExportFileName(now)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
  feedback.toast({ tone: 'success', title: 'Exported for Seelie', hint: link.download })
}

watch(accountId, () => {
  pickerOpen.value = false
  importOpen.value = false
  settingsOpen.value = false
  itemOpen.value = false
  doneOpen.value = false
  selecting.value = false
  clearFilters()
})

// ------------------------------------------------------------------ chrome

const newest = computed(() => {
  const at = account.value.latest?.takenAt
  return at === undefined
    ? null
    : { iso: new Date(at).toISOString(), ago: formatRelative(at), title: formatDateTime(at) }
})
const importTo = computed(() => ({
  name: 'account-import',
  params: { accountId: account.value.id },
}))
const loadError = computed(() => resource.error.value ?? store.error.value ?? state.error.value)
const hasGoals = computed(
  () => (board.value?.entries.length ?? 0) + (board.value?.items.length ?? 0) > 0,
)
const settingsLabel = computed(() => {
  const parts = ['Planner settings']
  if (ar.value !== null) parts.push(`AR ${ar.value}`)
  if (wl.value !== null) parts.push(`WL ${wl.value}`)
  return parts.join(' · ')
})
/** Open once the data is in, and only on a card that exists (a stale link does nothing). */
const editorShown = computed(() => !!editorEntry.value && !!planner.value)
const itemEditorShown = computed(
  () => !!itemKey.value && !!board.value && !!planner.value?.materialsByKey.has(itemKey.value),
)
const LEGEND = (['all', 'alone', 'short'] as const).map((s) => READINESS[s])

// An editor opened from inside a dialog closes with it (and stops holding live updates).
watch([editorShown, itemEditorShown, doneOpen], (now, before) => {
  const closed = now.some((open, i) => !open && before?.[i])
  if (closed && itemOpen.value && itemRequest.value?.anchor.closest('dialog')) {
    itemOpen.value = false
  }
})
</script>

<template>
  <PageHeader title="Planner">
    <template v-if="data" #meta>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
        <UiSegmented v-if="board && hasGoals" v-model="tab" :options="TABS" label="View" />
        <p v-if="newest && hasCapture" class="flex items-center gap-1.5">
          <Clock class="size-4" aria-hidden="true" />
          <span class="sr-only">Newest capture</span>
          <time :datetime="newest.iso" :title="newest.title">{{ newest.ago }}</time>
        </p>
        <p v-else class="flex items-center gap-1.5">
          <Info class="size-4" aria-hidden="true" />
          No capture: counts are yours
          <RouterLink :to="importTo" class="font-medium text-accent-text hover:underline"
            >Import</RouterLink
          >
        </p>
        <p v-if="replaced" class="flex items-center gap-1.5 text-accent-text">
          <Info class="size-4" aria-hidden="true" />
          {{ formatNumber(replaced) }} hand {{ replaced === 1 ? 'edit' : 'edits' }} replaced by the
          capture
          <button
            type="button"
            class="rounded px-1.5 font-medium hover:bg-surface-overlay"
            @click="state.prune()"
          >
            OK
          </button>
        </p>
      </div>
    </template>
    <template v-if="board" #actions>
      <template v-if="hasGoals">
        <UiButton title="Import from or export to Seelie" @click="importOpen = true">
          <FileInput class="size-4" aria-hidden="true" />
          Seelie
        </UiButton>
        <UiButton variant="primary" title="Add goals" @click="openPicker()">
          <Plus class="size-4" aria-hidden="true" />
          Add
        </UiButton>
      </template>
      <UiIconButton :label="settingsLabel" @click="settingsOpen = true">
        <Settings2 class="size-5" aria-hidden="true" />
      </UiIconButton>
    </template>
  </PageHeader>

  <UiError
    v-if="loadError && !board"
    title="Could not load the planner"
    :error="loadError"
    @retry="
      resource.error.value ? resource.reload() : store.error.value ? store.reload() : state.reload()
    "
  />

  <template
    v-else-if="
      board &&
      planner &&
      basePlanner &&
      good &&
      goodView &&
      bag &&
      totals &&
      plan &&
      requirementCache
    "
  >
    <div
      v-if="tasks?.tasks.value && (!hasGoals || tab === 'farm')"
      class="mb-3 flex flex-col gap-3"
    >
      <ResinTracker
        :reading="reading"
        :condensed="condensed.count"
        :condensed-max="condensed.max"
        :steps="settings.planner.resinSteps ?? []"
        :now="now"
        :account-id="account.id"
        :account-name="accountLabel"
        :url="plannerUrl"
        @set="(value) => void saveSettings({ resin: value })"
      />
      <TasksStrip
        :tasks="tasks.tasks.value"
        :now="now"
        :server="account.server"
        @change="tasks.change"
      />
    </div>

    <UiPanel v-if="!hasGoals" flush>
      <UiEmpty title="No goals">
        <template #icon><Target aria-hidden="true" /></template>
        <UiButton variant="primary" @click="openPicker()">
          <Plus class="size-4" aria-hidden="true" />
          Add goals
        </UiButton>
        <UiButton @click="importOpen = true">
          <FileInput class="size-4" aria-hidden="true" />
          Import from Seelie
        </UiButton>
        <UiButton v-if="!hasCapture" :to="importTo">
          <Upload class="size-4" aria-hidden="true" />
          Import a capture
        </UiButton>
      </UiEmpty>
    </UiPanel>

    <template v-else>
      <!-- v-show on a wrapper: on the component it would re-render it with every change here. -->
      <div v-if="seen.farm" v-show="tab === 'farm'">
        <FarmPanel
          v-model:view="farmView"
          v-model:forge="forge"
          :planner="planner"
          :totals="totals"
          :plan="plan"
          :steps="steps"
          :drops="drops"
          :ar="ar"
          :wl="wl"
          :refreshes="settings.planner.refreshes ?? 0"
          :day="day"
          :resin-held="resinHeld"
          :farming="farming"
          :artifacts="artifactWants"
          @settings="settingsOpen = true"
        />
      </div>

      <div v-if="seen.goals" v-show="tab === 'goals'" class="flex flex-col gap-4">
        <GoalToolbar
          v-model:filters="filters"
          v-model:sort="sort"
          :status-counts="statusCounts"
          :element-counts="elementCounts"
          :rarity-counts="rarityCounts"
          :rarities="rarities"
          :filtered="filtered"
          @clear="clearFilters"
        />

        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ul
            class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary"
            aria-label="Readiness"
          >
            <li v-for="s in LEGEND" :key="s.label" class="inline-flex items-center gap-1.5">
              <span class="size-2 rounded-full" :class="s.dot" aria-hidden="true" />
              <span class="font-medium text-text-primary">{{ s.label }}</span>
              {{ s.meaning }}
            </li>
          </ul>
          <UiButton
            v-if="pendingEntries.length"
            variant="ghost"
            size="sm"
            :aria-pressed="selecting"
            title="Pick goals to change together"
            @click="selecting = !selecting"
          >
            <CheckSquare class="size-4" aria-hidden="true" />
            Select
          </UiButton>
        </div>

        <div
          v-if="selecting"
          class="sticky top-[4.5rem] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border-strong bg-surface-raised/95 px-2 py-2 shadow-overlay backdrop-blur"
          role="toolbar"
          aria-label="Selected goals"
        >
          <span
            class="tabular inline-flex min-w-8 items-center justify-center rounded-md bg-accent/15 px-2 font-mono text-sm font-semibold text-accent-text"
            role="status"
            :title="`${formatNumber(picked.size)} selected`"
            >{{ formatNumber(picked.size) }}<span class="sr-only"> selected</span></span
          >
          <UiButton variant="ghost" size="sm" @click="pickAll">
            {{ allPicked ? 'None' : 'All' }}
          </UiButton>
          <UiSelect
            v-model="bulkPreset"
            :options="presetChoices"
            class="w-36"
            aria-label="Apply a preset"
            :disabled="picked.size === 0"
          />
          <UiButton size="sm" :disabled="picked.size === 0" @click="bulkActive(false)">
            <EyeOff class="size-4" aria-hidden="true" />
            Pause
          </UiButton>
          <UiButton size="sm" :disabled="picked.size === 0" @click="bulkActive(true)">
            <Eye class="size-4" aria-hidden="true" />
            Count
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            class="text-danger-text"
            :disabled="picked.size === 0"
            @click="bulkRemove"
          >
            <Trash2 class="size-4" aria-hidden="true" />
            Remove
          </UiButton>
          <UiIconButton label="Done selecting" class="ml-auto" @click="selecting = false">
            <X class="size-5" aria-hidden="true" />
          </UiIconButton>
        </div>

        <UiPanel v-if="matching.length === 0 && shownItems.length === 0" flush>
          <UiEmpty title="No matches">
            <template #icon><SearchX aria-hidden="true" /></template>
            <UiButton @click="clearFilters">Clear</UiButton>
          </UiEmpty>
        </UiPanel>

        <ul
          v-if="pendingEntries.length"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-label="Goals"
        >
          <li v-for="entry in shownPending" :key="entry.id" class="flex">
            <GoalCard
              :entry="entry"
              :planner="planner"
              :ar="ar"
              :hint="hintOf(entry)"
              :needs="needs.get(entry.id) ?? null"
              :goal="entryGoals.get(entry.id) ?? null"
              :order="orderOf(entry)"
              :selecting="selecting"
              :selected="picked.has(entry.id)"
              @open="(tab) => openEntry(entry, tab ?? null)"
              @select="togglePicked(entry.id)"
              @grab="drag.start(entry.id, $event)"
              @nudge="drag.key(entry.id, $event)"
              @toggle="toggleActive(entry)"
              @favorite="toggleFavorite(entry)"
              @done="(part, text) => askDone(entry, part, text)"
            />
          </li>
        </ul>

        <ExtraItems
          v-if="shownItems.length"
          :items="shownItems"
          :planner="planner"
          :goals="board.goals"
          :totals="totals"
          :inventory="bag"
          :options="planOptions"
          @open="(key) => openEditor(itemGoalId(key))"
          @toggle="toggleItem"
          @add="openPicker('item')"
        />

        <section v-if="doneEntries.length" aria-label="Done">
          <button
            type="button"
            class="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
            :aria-expanded="showDone"
            @click="showDone = !showDone"
          >
            Done
            <span class="tabular font-mono font-normal text-text-muted">{{
              doneEntries.length
            }}</span>
          </button>
          <ul
            v-if="showDone"
            class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Done goals"
          >
            <li v-for="entry in doneEntries" :key="entry.id" class="flex">
              <GoalCard
                :entry="entry"
                :planner="planner"
                :ar="ar"
                :hint="null"
                :needs="null"
                :goal="null"
                :selecting="selecting"
                :selected="picked.has(entry.id)"
                @open="(tab) => openEntry(entry, tab ?? null)"
                @select="togglePicked(entry.id)"
                @toggle="toggleActive(entry)"
                @favorite="toggleFavorite(entry)"
              />
            </li>
          </ul>
        </section>
      </div>
    </template>

    <GoalModal
      :open="editorShown"
      :entry="editorEntry"
      :planner="planner"
      :base-planner="basePlanner"
      :good="goodView"
      :others="editorOthers"
      :options="planOptions"
      :drops="drops"
      :ar="ar"
      :wl="wl"
      :refreshes="settings.planner.refreshes ?? 0"
      :taken="takenCharacters"
      :names="customNames"
      :farming="farming"
      :start-tab="editorTab"
      @close="closeEditor"
      @character="writeCharacter"
      @character-now="writeCharacterNow"
      @weapon="writeWeapon"
      @weapon-now="writeWeaponNow"
      @add-weapon="addWeaponGoal"
      @remove-weapon="removeWeaponGoal"
      @toggle="editorEntry && toggleActive(editorEntry)"
      @favorite="editorEntry && toggleFavorite(editorEntry)"
      @remove="removeEntry"
      @replace="replaceWith"
    />
    <ItemEditor
      :open="itemEditorShown"
      :item-key="itemKey"
      :planner="planner"
      :good="goodView"
      :target="editorItem"
      :others="editorOthers"
      :options="planOptions"
      :saving="store.saving.value"
      @close="closeEditor"
      @save="save"
      @remove="removeItem"
    />
    <GoalPicker
      :open="pickerOpen"
      :planner="basePlanner"
      :good="goodView"
      :taken="taken"
      :start="pickerStart"
      :saving="store.saving.value"
      @close="pickerOpen = false"
      @characters="addCharacters"
      @weapon="addWeapon"
      @item="addItem"
      @custom="addCustom"
    />
    <SeelieImport
      v-if="seelieShown"
      :open="importOpen"
      :planner="basePlanner"
      :capture="good"
      :bag="bag"
      :targets="store.targets.value ?? []"
      :overrides="state.overrides.value ?? new Map()"
      :tasks="tasks?.tasks.value ?? []"
      :resin="reading"
      :settings="{ ar, wl, traveler: travelerGender }"
      :irminsul-ar="player.ar !== null"
      :server="account.server"
      :saving="importing"
      @close="importOpen = false"
      @apply="importSeelie"
      @export="exportSeelie"
    />
    <DoneDialog
      :open="doneOpen"
      :title="doneRequest?.entry.name ?? ''"
      :part="doneRequest?.label ?? ''"
      :from="doneRequest?.from ?? ''"
      :to="doneRequest?.to ?? ''"
      :cost="doneRequest?.cost ?? null"
      :planner="planner"
      :saving="doneSaving"
      @close="doneOpen = false"
      @confirm="confirmDone"
    />
    <ItemPopover
      :open="itemOpen"
      :anchor="itemRequest?.anchor ?? null"
      :item-key="itemRequest?.key ?? null"
      :context="itemRequest?.context ?? null"
      :touch="itemRequest?.touch ?? false"
      :planner="planner"
      :bag="bag"
      :capture="good.materials"
      :totals="totals"
      @close="itemOpen = false"
      @change="setCount"
      @add="addCount"
    />
  </template>

  <div v-else class="flex flex-col gap-4" aria-busy="true" aria-label="Loading planner">
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
      <UiSkeleton v-for="n in 3" :key="n" class="h-[4.5rem]" />
    </div>
    <UiSkeleton class="h-6 w-40" />
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <UiSkeleton v-for="n in 6" :key="n" class="h-40" />
    </div>
  </div>

  <PlannerSettings
    :open="settingsOpen"
    :settings="settings"
    :player="player"
    @close="settingsOpen = false"
    @change="(patch) => void saveSettings(patch)"
  />
</template>
