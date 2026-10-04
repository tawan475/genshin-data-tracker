<script setup lang="ts">
import { loadPlanner } from '@gdt/game-data'
import {
  createRequirementCache,
  loadDrops,
  msUntilReset,
  planEstimate,
  planTotals,
  serverWeekday,
  sourceGroups,
} from '@gdt/game-data/planner-math'
import type { PlannerTarget } from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clock, FileInput, Plus, Search, Target, Upload } from 'lucide-vue-next'
import FarmPanel from '@/components/planner/FarmPanel.vue'
import GoalCard from '@/components/planner/GoalCard.vue'
import GoalEditor, { type EditorSubject } from '@/components/planner/GoalEditor.vue'
import GoalPicker from '@/components/planner/GoalPicker.vue'
import SeelieImport from '@/components/planner/SeelieImport.vue'
import FilterChip from '@/components/characters/FilterChip.vue'
import {
  buildBoard,
  characterGoalId,
  targetId,
  weaponGoalId,
  type GoalEntry,
  type RequirementCache,
} from '@/components/planner/model'
import { remove, upsert, usePlannerTargets } from '@/components/planner/use-planner-targets'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadLatestInventory } from '@/data/account-data'
import { normalizeSearch } from '@/data/characters'
import { useResource } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { formatDateTime, formatRelative } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/**
 * Planner: goals per character (level, ascension, talents) and weapon, what
 * they cost from the newest snapshot's state, and what is still missing
 * against its inventory, grouped by where it is farmed. Targets live on the
 * server; everything else is computed here from @gdt/game-data.
 */
const account = useAccount()
const feedback = useFeedback()

// ------------------------------------------------------------------ data

const resource = useResource(
  () => account.value,
  async (a) => {
    if (!a.latest) return { accountId: a.id, inventory: null, planner: null, drops: null }
    const [inventory, planner, drops] = await Promise.all([
      loadLatestInventory(a),
      loadPlanner(),
      loadDrops(),
      loadGameIcons(),
    ])
    return { accountId: a.id, inventory, planner, drops }
  },
)
const data = computed(() => {
  const value = resource.data.value
  return value && value.accountId === account.value.id ? value : undefined
})
const planner = computed(() => data.value?.planner ?? null)
const good = computed(() => data.value?.inventory?.good ?? null)

const store = usePlannerTargets(computed(() => account.value.id))
onBeforeUnmount(() => void store.flush())

// One per planner data (it never changes): each goal's cost is computed once per state.
let cache: RequirementCache | null = null
const requirementCache = computed(() =>
  planner.value ? (cache ??= createRequirementCache(planner.value)) : null,
)
const board = computed(() => {
  const p = planner.value
  const g = good.value
  const targets = store.targets.value
  const c = requirementCache.value
  if (!p || !g || !targets || !c) return null
  return buildBoard(p, g, targets, c)
})
const totals = computed(() =>
  planner.value && good.value && board.value
    ? planTotals(planner.value, board.value.goals, good.value.materials)
    : null,
)
const groups = computed(() => (totals.value ? sourceGroups(totals.value, data.value?.drops) : []))
const estimate = computed(() => planEstimate(groups.value))
const short = computed(() => ({
  characterExp: (totals.value?.characterExp.missing ?? 0) > 0,
  weaponExp: (totals.value?.weaponExp.missing ?? 0) > 0,
  mora: (totals.value?.mora.missing ?? 0) > 0,
}))
const lines = computed(() => totals.value?.lines ?? new Map())

/**
 * Goals the inventory covers on its own (crafting included): what can be
 * levelled right now. Each is checked alone, not against the other goals.
 */
const ready = computed(() => {
  const set = new Set<string>()
  const p = planner.value
  const g = good.value
  if (!board.value || !p || !g) return set
  for (const entry of board.value.entries) {
    if (entry.done || !entry.active) continue
    const goals = [entry.character, ...entry.weapons].flatMap((x) =>
      x?.requirement ? [{ id: x.id, requirement: x.requirement }] : [],
    )
    if (goals.length === 0) continue
    const alone = planTotals(p, goals, g.materials)
    if (
      alone.mora.missing === 0 &&
      alone.characterExp.missing === 0 &&
      alone.weaponExp.missing === 0 &&
      [...alone.lines.values()].every((l) => l.missing === 0)
    ) {
      set.add(entry.id)
    }
  }
  return set
})

// ------------------------------------------------------------- server day

const now = ref(Date.now())
let dayTimer: ReturnType<typeof setTimeout> | undefined
function armDayTimer() {
  clearTimeout(dayTimer)
  dayTimer = setTimeout(
    () => {
      now.value = Date.now()
      armDayTimer()
    },
    msUntilReset(Date.now(), account.value.server) + 1000,
  )
}
watch(() => account.value.server, armDayTimer, { immediate: true })
onBeforeUnmount(() => clearTimeout(dayTimer))
const today = computed(() => serverWeekday(now.value, account.value.server))

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

// ------------------------------------------------------------------ goals

type GoalFilter = 'all' | 'ready' | 'off'
const filter = ref<GoalFilter>('all')
const query = ref('')
const showDone = ref(false)

const matching = computed(() => {
  const entries = board.value?.entries ?? []
  const q = normalizeSearch(query.value).trim()
  return entries.filter((e) => {
    if (filter.value === 'ready' && !ready.value.has(e.id)) return false
    if (filter.value === 'off' && e.active) return false
    if (!q) return true
    const names = [e.name, ...e.weapons.map((w) => w.name)].join(' ')
    return normalizeSearch(names).includes(q)
  })
})
const pendingEntries = computed(() => matching.value.filter((e) => !e.done))
const doneEntries = computed(() => matching.value.filter((e) => e.done))
const counts = computed(() => {
  const entries = board.value?.entries ?? []
  return {
    all: entries.length,
    ready: ready.value.size,
    off: entries.filter((e) => !e.active).length,
  }
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

// ------------------------------------------------------------------ editor
// The open goal lives in the URL (?goal=character:HuTao): Back closes it.

const route = useRoute()
const router = useRouter()

function parseSubject(raw: unknown): EditorSubject | null {
  if (typeof raw !== 'string') return null
  const [kind, key, owner = ''] = raw.split(':')
  if (!key || !/^[A-Za-z0-9]+$/.test(key)) return null
  if (kind === 'character') return { kind, key }
  if (kind === 'weapon') return { kind, key, owner }
  return null
}
const subject = computed(() => parseSubject(route.query.goal))
let pushed = false
watch(subject, (value) => {
  if (value === null) pushed = false
})

function openEditor(next: EditorSubject) {
  const id =
    next.kind === 'character' ? characterGoalId(next.key) : weaponGoalId(next.key, next.owner)
  const query = { ...route.query, goal: id }
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

const editorCharacterTarget = computed(() => {
  const s = subject.value
  return s?.kind === 'character' ? (board.value?.characterGoals.get(s.key)?.target ?? null) : null
})
const editorWeapons = computed(() => {
  const s = subject.value
  const goals = board.value?.weaponGoals
  if (!s || !goals) return []
  if (s.kind === 'character') return [...goals.values()].filter((w) => w.owner === s.key)
  const one = goals.get(weaponGoalId(s.key, s.owner))
  return one ? [one] : []
})

function openEntry(entry: GoalEntry) {
  if (entry.character) openEditor({ kind: 'character', key: entry.character.key })
  else {
    const w = entry.weapons[0]!
    openEditor({ kind: 'weapon', key: w.key, owner: w.owner })
  }
}

type Ops = Parameters<typeof store.commit>[0]

async function save(ops: Ops) {
  try {
    await store.commit(ops)
    closeEditor()
  } catch {
    // The store already said what went wrong and reloaded.
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
      title: 'Goal removed',
      action: {
        label: 'Undo',
        run: () =>
          void store
            .commit(
              removed.map((t) =>
                t.kind === 'character'
                  ? upsert({ kind: 'character', key: t.key, target: t.target })
                  : upsert({ kind: 'weapon', key: t.key, owner: t.owner, target: t.target }),
              ),
            )
            .catch(() => {}),
      },
    })
  } catch {
    // Reported by the store.
  }
}

// ------------------------------------------------------------- add, import

const pickerOpen = ref(false)
const importOpen = ref(false)
const taken = computed(() => new Set((store.targets.value ?? []).map((t) => targetId(t))))

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

watch(
  () => account.value.id,
  () => {
    pickerOpen.value = false
    importOpen.value = false
    query.value = ''
    filter.value = 'all'
  },
)

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
const loadError = computed(() => resource.error.value ?? store.error.value)
const hasGoals = computed(() => (board.value?.entries.length ?? 0) > 0)
/** Open once the data is in, and only for something the planner data knows (a stale link does nothing). */
const editorShown = computed(() => {
  const s = subject.value
  const p = planner.value
  if (!s || !p || !board.value) return false
  return s.kind === 'character' ? p.characters.has(s.key) : p.weapons.has(s.key)
})
</script>

<template>
  <PageHeader title="Planner">
    <template v-if="newest && hasGoals" #meta>
      <p class="flex items-center gap-1.5 text-text-secondary">
        <Clock class="size-4" aria-hidden="true" />
        <span class="sr-only">Newest snapshot</span>
        <time :datetime="newest.iso" :title="newest.title">{{ newest.ago }}</time>
      </p>
    </template>
    <template v-if="board && hasGoals" #actions>
      <UiSegmented v-model="tab" :options="TABS" label="View" />
      <UiButton title="Import from Seelie" @click="importOpen = true">
        <FileInput class="size-4" aria-hidden="true" />
        Seelie
      </UiButton>
      <UiButton variant="primary" @click="pickerOpen = true">
        <Plus class="size-4" aria-hidden="true" />
        Add
      </UiButton>
    </template>
  </PageHeader>

  <UiPanel v-if="!account.latest || (data && !data.inventory)" flush>
    <UiEmpty title="No snapshots yet">
      <template #icon><Target aria-hidden="true" /></template>
      <UiButton variant="primary" :to="importTo">
        <Upload class="size-5" aria-hidden="true" />
        Import
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <UiError
    v-else-if="loadError && !board"
    title="Could not load the planner"
    :error="loadError"
    @retry="resource.error.value ? resource.reload() : store.reload()"
  />

  <template v-else-if="board && planner && good && totals && requirementCache">
    <UiPanel v-if="!hasGoals" flush>
      <UiEmpty title="No goals">
        <template #icon><Target aria-hidden="true" /></template>
        <UiButton variant="primary" @click="pickerOpen = true">
          <Plus class="size-5" aria-hidden="true" />
          Add goal
        </UiButton>
        <UiButton @click="importOpen = true">
          <FileInput class="size-5" aria-hidden="true" />
          Import from Seelie
        </UiButton>
      </UiEmpty>
    </UiPanel>

    <FarmPanel
      v-else-if="tab === 'farm'"
      v-model:missing-only="missingOnly"
      :planner="planner"
      :totals="totals"
      :groups="groups"
      :today="today"
      :estimate="estimate"
    />

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 flex-1 basis-48">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput v-model="query" class="pl-9" placeholder="Search" type="search" />
        </label>
        <div class="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          <FilterChip :pressed="filter === 'all'" :count="counts.all" @toggle="filter = 'all'"
            >All</FilterChip
          >
          <FilterChip
            :pressed="filter === 'ready'"
            :count="counts.ready"
            title="Enough in the bag, each goal on its own"
            @toggle="filter = filter === 'ready' ? 'all' : 'ready'"
            >In stock</FilterChip
          >
          <FilterChip
            :pressed="filter === 'off'"
            :count="counts.off"
            title="Left out of the totals"
            @toggle="filter = filter === 'off' ? 'all' : 'off'"
            >Paused</FilterChip
          >
        </div>
      </div>

      <p v-if="matching.length === 0" class="py-8 text-center text-text-secondary">No matches</p>

      <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Goals">
        <li v-for="entry in pendingEntries" :key="entry.id" class="flex">
          <GoalCard
            :entry="entry"
            :planner="planner"
            :ready="ready.has(entry.id)"
            @open="openEntry(entry)"
            @toggle="toggleActive(entry)"
          />
        </li>
      </ul>

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
              :ready="false"
              @open="openEntry(entry)"
              @toggle="toggleActive(entry)"
            />
          </li>
        </ul>
      </section>
    </div>

    <GoalEditor
      :open="editorShown"
      :subject="subject"
      :planner="planner"
      :good="good"
      :cache="requirementCache"
      :character-target="editorCharacterTarget"
      :weapon-goals="editorWeapons"
      :lines="lines"
      :short="short"
      :saving="store.saving.value"
      @close="closeEditor"
      @save="save"
      @remove="removeGoal"
    />
    <GoalPicker
      :open="pickerOpen"
      :planner="planner"
      :good="good"
      :taken="taken"
      @close="pickerOpen = false"
      @pick="pick"
    />
    <SeelieImport
      :open="importOpen"
      :planner="planner"
      :good="good"
      :targets="store.targets.value ?? []"
      :saving="store.saving.value"
      @close="importOpen = false"
      @apply="importGoals"
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
</template>
