<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { Clock, FileUp, Info, SearchX } from 'lucide-vue-next'
import { decodeAchievements } from '@gdt/shared'
import { achievementText, loadAchievements } from '@gdt/game-data'
import {
  NO_ACHIEVEMENT_FILTERS,
  achievementVersions,
  captureAchievements,
  countAchievements,
  filterAchievements,
  groupAchievements,
  hasAchievementFilters,
  idsToMark,
  idsToUnmark,
  matchesCompletion,
  summarizeAchievements,
  type AchievementEntry,
  type AchievementFilters,
  type CapturedAchievements,
  type DoneState,
  type ProgressCount,
} from '@gdt/game-data/achievement-progress'
import AchievementCategories, {
  type CategoryItem,
} from '@/components/achievements/AchievementCategories.vue'
import AchievementGroup from '@/components/achievements/AchievementGroup.vue'
import AchievementImportDialog from '@/components/achievements/AchievementImportDialog.vue'
import AchievementSummary from '@/components/achievements/AchievementSummary.vue'
import AchievementToolbar from '@/components/achievements/AchievementToolbar.vue'
import { useAchievementMarks } from '@/components/achievements/use-achievement-marks'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadBundle, type AccountRef } from '@/data/account-data'
import { useResource } from '@/data/use-resource'
import { gameIcon, loadGameIcons } from '@/lib/assets'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/**
 * Achievements: done = the newest snapshot that has achievements (irminsul
 * sees them when the in-game menu is opened) plus the ones marked by hand.
 * Categories beside (a select on small screens), filters on top, rows
 * rendered a page at a time as the list scrolls.
 */
const account = useAccount()
const feedback = useFeedback()

const game = useResource(
  () => 0,
  async () => {
    const [data, text] = await Promise.all([
      loadAchievements(),
      achievementText('en'),
      loadGameIcons(),
    ])
    return { data, text, entries: groupAchievements(data) }
  },
)

const NONE: CapturedAchievements = {
  ids: new Set(),
  takenAt: null,
  firstTakenAt: null,
  firstSeen: new Map(),
}

async function loadCaptured(a: AccountRef): Promise<CapturedAchievements> {
  const bundle = await loadBundle(a, { sections: ['achievements'] })
  return captureAchievements(
    bundle.snapshots.map((s) => ({ takenAt: s.takenAt, key: s.achievements })),
    (key) => {
      const text = bundle.texts.get(key)
      return text === undefined ? [] : decodeAchievements(JSON.parse(text))
    },
  )
}

// Tagged with the account, so a switch shows a skeleton, not the last account's data.
const capture = useResource(
  () => account.value,
  async (a) => ({ accountId: a.id, captured: a.latest ? await loadCaptured(a) : NONE }),
)
const captured = computed(() => {
  const value = capture.data.value
  return value && value.accountId === account.value.id ? value.captured : null
})

const marks = useAchievementMarks(() => account.value.id)

const state = computed<DoneState>(() => ({
  captured: captured.value?.ids ?? NONE.ids,
  marked: marks.marked.value,
}))
const ready = computed(
  () => !!game.data.value && !!captured.value && marks.loadedFor.value === account.value.id,
)
const loadError = computed(() => game.error.value ?? capture.error.value ?? marks.error.value)
function retry() {
  if (game.error.value) void game.reload()
  if (capture.error.value) void capture.reload()
  if (marks.error.value) void marks.reload()
}

const entries = computed(() => game.data.value?.entries ?? [])
const summary = computed(() =>
  game.data.value
    ? summarizeAchievements(entries.value, state.value, game.data.value.data.byId)
    : null,
)

const ZERO: ProgressCount = { done: 0, total: 0, primogems: 0, primogemsTotal: 0 }
const categories = computed<CategoryItem[]>(() => {
  const g = game.data.value
  const s = summary.value
  if (!g || !s) return []
  return g.data.goals
    .filter((goal) => s.byGoal.has(goal.id))
    .map((goal) => ({
      id: goal.id,
      name: g.text.goals.get(goal.id) ?? `#${goal.id}`,
      icon: gameIcon(goal.icon),
      count: s.byGoal.get(goal.id) ?? ZERO,
    }))
})
const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])))
const versions = computed(() => achievementVersions(entries.value))

const newestCapture = computed(() => {
  const at = captured.value?.takenAt
  return at == null
    ? null
    : { iso: new Date(at).toISOString(), ago: formatRelative(at), title: formatDateTime(at) }
})

// ------------------------------------------------------------------ filters

const filters = reactive<AchievementFilters>({ ...NO_ACHIEVEMENT_FILTERS })
const filtered = computed(() => hasAchievementFilters(filters))

/**
 * Entries toggled since the filters last changed stay in view, so marking
 * one done under "Missing" does not make it vanish under the pointer.
 */
const kept = shallowRef<ReadonlySet<number>>(new Set())
const entryOfTier = computed(() => {
  const map = new Map<number, number>()
  for (const entry of entries.value) for (const tier of entry.tiers) map.set(tier.id, entry.id)
  return map
})
function keep(ids: number[]) {
  if (filters.completion === 'all') return
  const next = new Set(kept.value)
  for (const id of ids) {
    const entry = entryOfTier.value.get(id)
    if (entry !== undefined) next.add(entry)
  }
  kept.value = next
}

const shown = computed<AchievementEntry[]>(() => {
  const g = game.data.value
  if (!g) return []
  return filterAchievements(
    entries.value,
    { ...filters, completion: 'all' },
    state.value,
    g.text,
  ).filter(
    (entry) =>
      kept.value.has(entry.id) || matchesCompletion(entry, filters.completion, state.value),
  )
})

function clearFilters() {
  Object.assign(filters, NO_ACHIEVEMENT_FILTERS)
}
/** Counted in achievements (tiers), like the summary. */
const shownCount = computed(() => countAchievements(shown.value, filters.completion, state.value))

// Picking a category far down the list starts it from its top.
const listTop = ref<HTMLElement>()
watch(
  () => filters.goal,
  () => {
    const top = listTop.value
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' })
  },
)

function toggleMissing() {
  filters.completion = filters.completion === 'missing' ? 'all' : 'missing'
}

// ---------------------------------------------------------- lazy rendering

const PAGE = 60
const limit = ref(PAGE)
watch([filters, () => account.value.id], () => {
  limit.value = PAGE
  kept.value = new Set()
})

const groups = computed(() => {
  const list: { category: CategoryItem; entries: AchievementEntry[] }[] = []
  for (const entry of shown.value.slice(0, limit.value)) {
    let group = list.at(-1)
    if (!group || group.category.id !== entry.goal) {
      const category = categoryById.value.get(entry.goal)
      if (!category) continue
      list.push((group = { category, entries: [] }))
    }
    group.entries.push(entry)
  }
  return list
})

const sentinel = ref<HTMLElement>()
let observer: IntersectionObserver | null = null

function more() {
  if (limit.value >= shown.value.length) return
  limit.value += PAGE
  // Observing again reports whether the sentinel is still in view.
  void nextTick(() => {
    if (!observer || !sentinel.value) return
    observer.unobserve(sentinel.value)
    observer.observe(sentinel.value)
  })
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (records) => records.some((r) => r.isIntersecting) && more(),
    {
      rootMargin: '0px 0px 800px 0px',
    },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})
watch(sentinel, (element, previous) => {
  if (previous) observer?.unobserve(previous)
  if (element) observer?.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

// ------------------------------------------------------------------ marking

function undoAction(done: number[], undone: number[]) {
  return { label: 'Undo', run: () => void marks.change(done, undone) }
}

function mark(ids: number[]) {
  keep(ids)
  void marks.change(ids)
}
function unmark(ids: number[]) {
  keep(ids)
  void marks.change([], ids)
}

const toMark = computed(() => idsToMark(shown.value, state.value))
const toUnmark = computed(() => idsToUnmark(shown.value, state.value))

async function markAll() {
  const ids = toMark.value
  if (!ids.length) return
  const n = formatNumber(ids.length)
  const ok = await feedback.confirm({
    title: `Mark ${n} done?`,
    detail: filtered.value
      ? `The ${n} shown achievements left are marked done by hand.`
      : `Every achievement left (${n}) is marked done by hand.`,
    confirmLabel: 'Mark done',
  })
  if (ok && (await marks.change(ids)))
    feedback.toast({ tone: 'success', title: `${n} marked done`, action: undoAction([], ids) })
}

async function unmarkAll() {
  const ids = toUnmark.value
  if (!ids.length) return
  const n = formatNumber(ids.length)
  const ok = await feedback.confirm({
    title: `Unmark ${n}?`,
    detail: `Removes the hand marks of the ${n} shown achievements. Captured ones stay done.`,
    confirmLabel: 'Unmark',
    tone: 'danger',
  })
  if (ok && (await marks.change([], ids)))
    feedback.toast({ tone: 'success', title: `${n} unmarked`, action: undoAction(ids, []) })
}

// ------------------------------------------------------------------ import

const importOpen = ref(false)
async function importIds(ids: number[]): Promise<boolean> {
  const ok = await marks.change(ids)
  if (ok)
    feedback.toast({
      tone: 'success',
      title: `${formatNumber(ids.length)} added`,
      action: undoAction([], ids),
    })
  return ok
}
</script>

<template>
  <div>
    <PageHeader title="Achievements">
      <template v-if="ready && captured" #meta>
        <p v-if="newestCapture" class="flex items-center gap-1.5 text-text-secondary">
          <Clock class="size-4" aria-hidden="true" />
          <span class="sr-only">Newest capture</span>
          <time :datetime="newestCapture.iso" :title="`Newest capture: ${newestCapture.title}`">{{
            newestCapture.ago
          }}</time>
        </p>
        <p v-else class="flex items-start gap-2 text-sm text-text-secondary">
          <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Open the in-game Achievements menu while irminsul runs to capture them.
        </p>
      </template>
      <template #actions>
        <UiButton
          :disabled="!ready"
          title="Import done achievements from a Seelie export or a stardb / irminsul file"
          @click="importOpen = true"
        >
          <FileUp class="size-4" aria-hidden="true" />
          Seelie / stardb
        </UiButton>
      </template>
    </PageHeader>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="ready && summary && game.data.value && captured">
      <AchievementSummary
        class="mb-4 lg:mb-6"
        :summary="summary"
        :missing-only="filters.completion === 'missing'"
        @toggle-missing="toggleMissing"
      />

      <div class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <aside class="hidden lg:block">
          <div
            class="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-border-default bg-surface-raised p-2 shadow-sm [scrollbar-width:thin]"
          >
            <AchievementCategories
              v-model="filters.goal"
              :categories="categories"
              :total="summary"
            />
          </div>
        </aside>

        <div ref="listTop" class="flex min-w-0 scroll-mt-20 flex-col gap-4">
          <AchievementToolbar
            v-model:filters="filters"
            :categories="categories"
            :versions="versions"
            :shown="shownCount"
            :total="summary.total"
            :filtered="filtered"
            :to-mark="toMark.length"
            :to-unmark="toUnmark.length"
            @clear="clearFilters"
            @mark-all="markAll"
            @unmark-all="unmarkAll"
          />

          <UiEmpty v-if="shown.length === 0" title="No matches">
            <template #icon><SearchX aria-hidden="true" /></template>
            <UiButton @click="clearFilters">Clear</UiButton>
          </UiEmpty>

          <AchievementGroup
            v-for="group in groups"
            :key="group.category.id ?? 'all'"
            :category="group.category"
            :entries="group.entries"
            :text="game.data.value.text"
            :state="state"
            :first-seen="captured.firstSeen"
            :first-taken-at="captured.firstTakenAt"
            @mark="mark"
            @unmark="unmark"
          />

          <div v-if="limit < shown.length" ref="sentinel" class="flex justify-center">
            <UiButton variant="ghost" @click="more">
              More
              <span class="tabular font-mono text-text-muted">{{
                formatNumber(shown.length - limit)
              }}</span>
            </UiButton>
          </div>
        </div>
      </div>

      <AchievementImportDialog
        :open="importOpen"
        :state="state"
        :known="game.data.value.data.byId"
        :save="importIds"
        @close="importOpen = false"
      />
    </template>

    <div v-else aria-busy="true" aria-label="Loading">
      <div class="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:mb-6">
        <UiSkeleton v-for="n in 4" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <div class="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
        <UiSkeleton class="hidden h-[28rem] lg:block" />
        <div class="flex flex-col gap-4">
          <UiSkeleton class="h-28 w-full" />
          <div class="rounded-xl border border-border-default bg-surface-raised p-4">
            <div v-for="n in 6" :key="n" class="flex items-start gap-3 py-3">
              <UiSkeleton class="size-7 rounded-full" />
              <div class="flex flex-1 flex-col gap-2">
                <UiSkeleton class="h-4 w-48" />
                <UiSkeleton class="h-4 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
