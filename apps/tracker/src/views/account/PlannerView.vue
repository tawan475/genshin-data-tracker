<script setup lang="ts">
import { loadPlanner } from '@gdt/game-data'
import { NO_PLAYER } from '@/data/account-player'
import { loadDropRates } from '@gdt/game-data/drops'
import { craftingSteps } from '@gdt/game-data/planner-convert'
import { domainSchedule, farmPlan, resinNow, todayPlan } from '@gdt/game-data/planner-estimate'
import {
  createRequirementCache,
  itemGoal,
  planTotals,
  type PlanGoal,
  type PlanOptions,
} from '@gdt/game-data/planner-math'
import type { Good, PlannerTarget } from '@gdt/shared'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clock, FileInput, Info, Plus, SearchX, Settings2, Target, Upload } from 'lucide-vue-next'
import DoneDialog from '@/components/planner/DoneDialog.vue'
import ExtraItems from '@/components/planner/ExtraItems.vue'
import FarmPanel from '@/components/planner/FarmPanel.vue'
import GoalCard from '@/components/planner/GoalCard.vue'
import GoalEditor from '@/components/planner/GoalEditor.vue'
import GoalPicker from '@/components/planner/GoalPicker.vue'
import GoalToolbar from '@/components/planner/GoalToolbar.vue'
import ItemEditor from '@/components/planner/ItemEditor.vue'
import ItemPopover from '@/components/planner/ItemPopover.vue'
import PlannerSettings from '@/components/planner/PlannerSettings.vue'
import SeelieImport from '@/components/planner/SeelieImport.vue'
import { costChanges, doneCost, type DoneCost, type DonePart } from '@/components/planner/done'
import { READINESS } from '@/components/planner/farm-format'
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
import {
  countChange,
  effectiveInventory,
  replacedAdjustments,
} from '@/components/planner/hand-edits'
import { provideItemPopover, type ItemRequest } from '@/components/planner/item-popover'
import {
  buildBoard,
  characterGoalId,
  entryGoal,
  inputOf,
  itemGoalId,
  nextHint,
  shortCount,
  targetId,
  weaponGoalId,
  withoutPassives,
  type EditorSubject,
  type GoalEntry,
  type ItemGoalView,
  type NextHint,
  type RequirementCache,
} from '@/components/planner/model'
import { goalNeeds, type GoalNeeds } from '@/components/planner/needs'
import { usePlannerState, type CurrentChange } from '@/components/planner/use-planner-state'
import { upsert, usePlannerTargets } from '@/components/planner/use-planner-targets'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadAccountPlayer, loadLatestInventory } from '@/data/account-data'
import { usePlannerSettings } from '@/data/planner-settings'
import { useResource } from '@/data/use-resource'
import { loadGameIcons, loadMaterialIcons } from '@/lib/assets'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { updatesHeld } from '@/live/holds'
import { onPlannerChange } from '@/live/planner-changes'
import { useAccounts } from '@/stores/accounts'
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
 */
const account = useAccount()
const accounts = useAccounts()
const feedback = useFeedback()
const accountId = computed(() => account.value.id)
/** The capture hand edits are made against: the newest one's last sighting, 0 for none. */
const base = computed(() => account.value.latest?.lastSeenAt ?? 0)

const NO_CAPTURE: Good = {
  format: 'GOOD',
  version: 3,
  source: '',
  characters: [],
  artifacts: [],
  weapons: [],
  materials: {},
}

// ------------------------------------------------------------------ data

const resource = useResource(
  () => account.value,
  async (a) => {
    const [inventory, planner, drops, player] = await Promise.all([
      a.latest ? loadLatestInventory(a) : Promise.resolve(null),
      loadPlanner(),
      // No rates means no estimates, not a broken page.
      loadDropRates().catch(() => null),
      // Nice to have: without it the settings (or the top bracket) decide.
      a.latest ? loadAccountPlayer(a).catch(() => NO_PLAYER) : Promise.resolve(NO_PLAYER),
      loadGameIcons(),
      loadMaterialIcons(),
    ])
    return { accountId: a.id, inventory, planner, drops, player }
  },
)
const data = computed(() => {
  const value = resource.data.value
  return value && value.accountId === account.value.id ? value : undefined
})
const planner = computed(() => data.value?.planner ?? null)
/** The newest capture (an empty one when there is none). */
const good = computed(() => (data.value ? (data.value.inventory?.good ?? NO_CAPTURE) : null))
const drops = computed(() => data.value?.drops ?? null)
const hasCapture = computed(() => !!data.value?.inventory)

const store = usePlannerTargets(accountId)
onBeforeUnmount(() => void store.flush())

const state = usePlannerState(accountId, base, async (id) => {
  // The page's account is behind the server: bring it up to date now.
  await accounts.reload(id).catch(() => {})
  accounts.applyPending(true)
})
onBeforeUnmount(() => void state.flush())

/** The bag the planner works with: the capture's counts and the hand edits that still apply. */
const bag = computed(() => {
  const g = good.value
  const edits = state.adjustments.value
  return g && edits ? effectiveInventory(g.materials, edits, base.value) : null
})
/** The capture with the planner's bag, for the dialogs that read counts. */
const goodView = computed<Good | null>(() =>
  good.value && bag.value ? { ...good.value, materials: bag.value } : null,
)
/** Edits a newer capture replaced (until the next write drops them). */
const replaced = computed(() =>
  state.adjustments.value ? replacedAdjustments(state.adjustments.value, base.value).length : 0,
)

const { settings, save: saveSettings } = usePlannerSettings(accountId)
const settingsOpen = ref(false)
/** What irminsul read at the newest login; an AR/WL setting wins over it. */
const player = computed(() => data.value?.player ?? NO_PLAYER)
const ar = computed(() => settings.value.ar ?? player.value.ar)
const wl = computed(() => settings.value.wl ?? player.value.wl)

/** Count the Mystic ore the chunks held can be forged into (this device's choice). */
const forge = ref(readStorage('planner:forge') === '1')
watch(forge, (value) => writeStorage('planner:forge', value ? '1' : '0'))

/** Characters in the snapshot, for the Mora passives (Raiden Shogun, Wanderer). */
const ownedCharacters = computed(() => new Set((good.value?.characters ?? []).map((c) => c.key)))
const passiveOwners = computed(() =>
  settings.value.planner.passives ? ownedCharacters.value : null,
)
const planOptions = computed<PlanOptions>(() => ({
  azoth: settings.value.planner.azoth,
  passives: passiveOwners.value,
  forge: forge.value,
}))

// One per planner data (it never changes): each goal's cost is computed once per state.
let cache: RequirementCache | null = null
const requirementCache = computed(() =>
  planner.value ? (cache ??= createRequirementCache(planner.value)) : null,
)
const board = computed(() => {
  const p = planner.value
  const g = good.value
  const b = bag.value
  const targets = store.targets.value
  const overrides = state.overrides.value
  const c = requirementCache.value
  if (!p || !g || !b || !targets || !overrides || !c) return null
  return buildBoard(p, g, b, targets, c, overrides)
})
const totals = computed(() =>
  planner.value && bag.value && board.value
    ? planTotals(planner.value, board.value.goals, bag.value, planOptions.value)
    : null,
)
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
const schedule = computed(() => (plan.value ? domainSchedule(plan.value) : []))

// A clock for today's domains, the reset countdown and the resin estimate.
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => clearInterval(clock))
const today = computed(() =>
  plan.value ? todayPlan(plan.value, now.value, account.value.server) : null,
)
const resin = computed(() => {
  const at = account.value.latest?.takenAt
  return planner.value && bag.value && at !== undefined && hasCapture.value
    ? resinNow(planner.value, bag.value, at, now.value, player.value.resin)
    : null
})
/** Weapon EXP still short (after forging, when that is on). */
const oreShort = computed(() => (totals.value?.weaponExp.missing ?? 0) > 0)

/** Each card's cost as one goal (a character with its weapons). */
const entryGoals = computed(() => {
  const map = new Map<string, PlanGoal>()
  const p = planner.value
  if (!p || !board.value) return map
  for (const entry of board.value.entries) {
    const goal = entryGoal(p, entry, passiveOwners.value)
    if (goal) map.set(entry.id, goal)
  }
  return map
})

/**
 * Per card: ready with every counted goal, ready alone, or short, and the
 * materials it is short of. A card with a goal that isn't counted is costed
 * together with the counted ones (its own goals left out of them).
 */
const needs = computed(() => {
  const map = new Map<string, GoalNeeds>()
  const p = planner.value
  const b = bag.value
  const t = totals.value
  if (!board.value || !p || !b || !t) return map
  const options = withoutPassives(planOptions.value)
  for (const entry of board.value.entries) {
    const goal = entryGoals.value.get(entry.id)
    if (entry.done || !goal) continue
    const own = [entry.character, ...entry.weapons].filter((x) => x !== null)
    const counted = own.every((x) => x.target.active)
    const others = counted
      ? t
      : { others: board.value.goals.filter((g) => !own.some((x) => x.id === g.id)) }
    map.set(entry.id, goalNeeds(p, goal, b, options, others))
  }
  return map
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
  map: new Map<string, NextHint | null>(),
}
const hints = computed(() => {
  const result = new Map<string, NextHint | null>()
  const p = planner.value
  const b = bag.value
  if (!board.value || !p || !b) return result
  const o = planOptions.value
  const optionsKey = JSON.stringify([o.azoth, !!o.passives, o.forge, ar.value])
  if (hintMemo.inventory !== b || hintMemo.options !== optionsKey) {
    hintMemo = { inventory: b, options: optionsKey, map: new Map() }
  }
  for (const entry of board.value.entries) {
    if (entry.done || missing.value.get(entry.id) === 0) continue
    const c = entry.character
    const key = JSON.stringify([
      entry.id,
      c ? [c.current, c.target.level, c.target.ascension, c.target.talents] : null,
      entry.weapons.map((w) => [w.key, w.owner, w.current, w.target.level, w.target.ascension]),
    ])
    let hint = hintMemo.map.get(key)
    if (hint === undefined) {
      hint = nextHint(p, entry, b, { ...o, ar: ar.value })
      hintMemo.map.set(key, hint)
    }
    result.set(entry.id, hint)
  }
  return result
})

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

const missingOnly = ref(readStorage('planner:missing') !== '0')
watch(missingOnly, (value) => writeStorage('planner:missing', value ? '1' : '0'))

type FarmView = 'sources' | 'schedule' | 'craft'
const savedFarmView = readStorage('planner:farm')
const farmView = ref<FarmView>(
  savedFarmView === 'schedule' || savedFarmView === 'craft' ? savedFarmView : 'sources',
)
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
const pendingEntries = computed(() =>
  sortGoals(
    matching.value.filter((e) => !e.done),
    sort.value,
    missing.value,
  ),
)
const doneEntries = computed(() => matching.value.filter((e) => e.done))
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
  const active = !entry.active
  const ops = []
  if (entry.character) {
    ops.push(
      upsert({
        kind: 'character',
        key: entry.character.key,
        target: { ...entry.character.target, active },
      }),
    )
  }
  for (const w of entry.weapons) {
    ops.push(
      upsert({ kind: 'weapon', key: w.key, owner: w.owner, target: { ...w.target, active } }),
    )
  }
  store.change(ops)
}

function toggleFavorite(entry: GoalEntry) {
  const c = entry.character
  if (!c) return
  const favorite = entry.favorite ? undefined : true
  store.change([upsert({ kind: 'character', key: c.key, target: { ...c.target, favorite } })])
}

function toggleItem(item: ItemGoalView) {
  const target = { ...item.target, active: !item.target.active }
  store.change([upsert({ kind: 'item', key: item.key, target })])
}

// ------------------------------------------------------------ inventory

/** The inventory editor every material icon opens (one for the page). */
const itemRequest = shallowRef<ItemRequest | null>(null)
const itemOpen = ref(false)
provideItemPopover((request) => {
  itemRequest.value = request
  itemOpen.value = true
})

function setCount(key: string, value: number) {
  const capture = good.value?.materials[key] ?? 0
  state.change({ inventory: [countChange(key, value, capture)] })
}

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
  return next.kind === 'character'
    ? { kind: 'character', key: next.key, current: current as typeof next.current | null }
    : {
        kind: 'weapon',
        key: next.key,
        owner: next.owner,
        current: current as typeof next.current | null,
      }
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

const route = useRoute()
const router = useRouter()

function parseSubject(raw: unknown): EditorSubject | null {
  if (typeof raw !== 'string') return null
  const [kind, key, owner = ''] = raw.split(':')
  if (!key || !/^[A-Za-z0-9]+$/.test(key)) return null
  if (kind === 'character' || kind === 'item') return { kind, key }
  if (kind === 'weapon') return { kind, key, owner }
  return null
}
const subject = computed(() => parseSubject(route.query.goal))
const goalSubject = computed(() => {
  const s = subject.value
  return s && s.kind !== 'item' ? s : null
})
const itemKey = computed(() => (subject.value?.kind === 'item' ? subject.value.key : null))
let pushed = false
watch(subject, (value) => {
  if (value === null) pushed = false
})

function subjectId(s: EditorSubject) {
  if (s.kind === 'character') return characterGoalId(s.key)
  if (s.kind === 'item') return itemGoalId(s.key)
  return weaponGoalId(s.key, s.owner)
}

function openEditor(next: EditorSubject) {
  const query = { ...route.query, goal: subjectId(next) }
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

const editorCharacter = computed(() => {
  const s = subject.value
  return s?.kind === 'character' ? (board.value?.characterGoals.get(s.key) ?? null) : null
})
const editorWeapons = computed(() => {
  const s = subject.value
  const goals = board.value?.weaponGoals
  if (!s || !goals || s.kind === 'item') return []
  if (s.kind === 'character') return [...goals.values()].filter((w) => w.owner === s.key)
  const one = goals.get(weaponGoalId(s.key, s.owner))
  return one ? [one] : []
})
const editorItem = computed(() => {
  const key = itemKey.value
  return key ? (board.value?.items.find((i) => i.key === key)?.target ?? null) : null
})
/** Every goal but the open one's, for its cost colours. */
const editorOthers = computed<PlanGoal[]>(() => {
  const s = subject.value
  const goals = board.value?.goals ?? []
  if (!s) return goals
  const mine = new Set([subjectId(s), ...editorWeapons.value.map((w) => w.id)])
  return goals.filter((g) => !mine.has(g.id))
})

function openEntry(entry: GoalEntry) {
  if (entry.character) openEditor({ kind: 'character', key: entry.character.key })
  else {
    const w = entry.weapons[0]!
    openEditor({ kind: 'weapon', key: w.key, owner: w.owner })
  }
}

type Ops = Parameters<typeof store.commit>[0]

/** Goals first: a new goal's current state needs the goal to land on. */
async function save(ops: Ops, current: CurrentChange[] = []) {
  try {
    await store.commit(ops)
    if (current.length) await state.commit({ current })
    closeEditor()
  } catch {
    // The stores already said what went wrong and reloaded.
  }
}

async function removeGoal(ops: Ops) {
  const before = new Map((store.targets.value ?? []).map((t) => [targetId(t), t]))
  const removed = ops
    .map((op) => (op.kind === 'remove' ? before.get(targetId(op.ref)) : undefined))
    .filter((t): t is PlannerTarget => t !== undefined)
  try {
    await store.commit(ops)
    closeEditor()
    feedback.toast({
      tone: 'info',
      title: removed.every((t) => t.kind === 'item') ? 'Item removed' : 'Goal removed',
      action: {
        label: 'Undo',
        run: () => void store.commit(removed.map((t) => upsert(inputOf(t)))).catch(() => {}),
      },
    })
  } catch {
    // Reported by the store.
  }
}

// ------------------------------------------------------------- add, import

const pickerOpen = ref(false)
const pickerStart = ref<'item' | null>(null)
const importOpen = ref(false)
const taken = computed(() => new Set((store.targets.value ?? []).map((t) => targetId(t))))

function openPicker(start: 'item' | null = null) {
  pickerStart.value = start
  pickerOpen.value = true
}

function pick(next: EditorSubject) {
  pickerOpen.value = false
  openEditor(next)
}

async function importGoals(ops: Ops) {
  try {
    await store.commit(ops)
    importOpen.value = false
    const added = ops.filter((op) => op.kind === 'upsert').length
    feedback.toast({ tone: 'success', title: `Imported ${added} goals` })
    tab.value = 'farm'
  } catch {
    // Reported by the store.
  }
}

watch(accountId, () => {
  pickerOpen.value = false
  importOpen.value = false
  settingsOpen.value = false
  itemOpen.value = false
  doneOpen.value = false
  clearFilters()
})

// ------------------------------------------------------------- live

/**
 * Goals or hand edits changed in another tab or device: re-read them, once
 * this tab is shown and nothing is open (data never changes under a dialog).
 */
let stale = false
function catchUp() {
  if (!stale || updatesHeld.value || document.visibilityState !== 'visible') return
  stale = false
  void store.refresh()
  void state.refresh()
}
const stopListening = onPlannerChange((id) => {
  if (id !== accountId.value) return
  stale = true
  catchUp()
})
watch(updatesHeld, catchUp)
document.addEventListener('visibilitychange', catchUp)
onBeforeUnmount(() => {
  stopListening()
  document.removeEventListener('visibilitychange', catchUp)
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
/** Open once the data is in, and only for something the planner data knows (a stale link does nothing). */
const editorShown = computed(() => {
  const s = goalSubject.value
  const p = planner.value
  if (!s || !p || !board.value) return false
  return s.kind === 'character' ? p.characters.has(s.key) : p.weapons.has(s.key)
})
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
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
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
        <UiSegmented v-model="tab" :options="TABS" label="View" />
        <UiButton title="Import from Seelie" @click="importOpen = true">
          <FileInput class="size-4" aria-hidden="true" />
          Seelie
        </UiButton>
        <UiButton variant="primary" title="Add goal" @click="openPicker()">
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
      board && planner && good && goodView && bag && totals && plan && today && requirementCache
    "
  >
    <UiPanel v-if="!hasGoals" flush>
      <UiEmpty title="No goals">
        <template #icon><Target aria-hidden="true" /></template>
        <UiButton variant="primary" @click="openPicker()">
          <Plus class="size-4" aria-hidden="true" />
          Add goal
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

    <FarmPanel
      v-else-if="tab === 'farm'"
      v-model:missing-only="missingOnly"
      v-model:view="farmView"
      v-model:forge="forge"
      :planner="planner"
      :totals="totals"
      :plan="plan"
      :steps="steps"
      :schedule="schedule"
      :today="today"
      :resin="resin"
      :ore-short="oreShort"
      @settings="settingsOpen = true"
    />

    <div v-else class="flex flex-col gap-4">
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
        <li v-for="entry in pendingEntries" :key="entry.id" class="flex">
          <GoalCard
            :entry="entry"
            :planner="planner"
            :ar="ar"
            :hint="hints.get(entry.id) ?? null"
            :needs="needs.get(entry.id) ?? null"
            :goal="entryGoals.get(entry.id) ?? null"
            @open="openEntry(entry)"
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
        @open="(key) => openEditor({ kind: 'item', key })"
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
              @open="openEntry(entry)"
              @toggle="toggleActive(entry)"
              @favorite="toggleFavorite(entry)"
            />
          </li>
        </ul>
      </section>
    </div>

    <GoalEditor
      :open="editorShown"
      :subject="goalSubject"
      :planner="planner"
      :good="goodView"
      :cache="requirementCache"
      :character-target="editorCharacter?.target ?? null"
      :character-current="editorCharacter?.current ?? null"
      :raised="editorCharacter?.raised ?? null"
      :weapon-goals="editorWeapons"
      :others="editorOthers"
      :options="planOptions"
      :drops="drops"
      :ar="ar"
      :wl="wl"
      :saving="store.saving.value || state.saving.value"
      @close="closeEditor"
      @save="save"
      @remove="removeGoal"
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
      @remove="removeGoal"
    />
    <GoalPicker
      :open="pickerOpen"
      :planner="planner"
      :good="goodView"
      :taken="taken"
      :start="pickerStart"
      @close="pickerOpen = false"
      @pick="pick"
    />
    <SeelieImport
      :open="importOpen"
      :planner="planner"
      :good="goodView"
      :targets="store.targets.value ?? []"
      :saving="store.saving.value"
      @close="importOpen = false"
      @apply="importGoals"
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
