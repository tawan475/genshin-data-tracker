<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { CheckCheck, Clock, Info, SearchX } from 'lucide-vue-next'
import { decodeAnecdotes as decodeAnecdotesSection, type AnecdotesSection } from '@gdt/shared'
import { anecdoteText, loadAnecdotes } from '@gdt/game-data'
import {
  DEFAULT_ANECDOTE_FILTERS,
  NO_CAPTURED_ANECDOTES,
  anecdoteProgress,
  capturedAnecdotes,
  countShown,
  filterAnecdotes,
  hasAnecdoteFilters,
  unfinishedFirst,
  type AnecdoteFilters,
  type CapturedAnecdotes,
} from '@/data/anecdote-progress'
import AnecdoteGroup from '@/components/anecdotes/AnecdoteGroup.vue'
import AnecdoteSummary from '@/components/anecdotes/AnecdoteSummary.vue'
import AnecdoteToolbar, { type AreaTab } from '@/components/anecdotes/AnecdoteToolbar.vue'
import { useAnecdoteMarks } from '@/components/anecdotes/use-anecdote-marks'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { loadBundle, type AccountRef } from '@/data/account-data'
import { useResource } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { readStorage, writeStorage } from '@/lib/storage'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useAccount, useReadOnly } from './context'

/**
 * Anecdotes ("Travel Accounts"): done = the newest capture that carried
 * irminsul's `gi_anecdotes`, plus the ones marked by hand. Area tabs with
 * done / total, then each NPC's anecdotes (hidden ones too, marked).
 */
const account = useAccount()
const readOnly = useReadOnly()

const game = useResource(
  () => 0,
  async () => {
    const [data, text] = await Promise.all([loadAnecdotes(), anecdoteText('en'), loadGameIcons()])
    return { data, text }
  },
)

async function loadCaptured(a: AccountRef): Promise<CapturedAnecdotes> {
  const bundle = await loadBundle(a, { sections: ['anecdotes'] })
  // Oldest first: the newest snapshot that has them.
  const newest = [...bundle.snapshots].reverse().find((s) => s.anecdotes)
  const text = newest?.anecdotes ? bundle.texts.get(newest.anecdotes) : undefined
  if (!newest || text === undefined) return NO_CAPTURED_ANECDOTES
  return capturedAnecdotes(
    decodeAnecdotesSection(JSON.parse(text) as AnecdotesSection),
    newest.takenAt,
  )
}

// Tagged with the account, so a switch shows a skeleton, not the last account's data.
const capture = useResource(
  () => account.value,
  async (a) => ({
    accountId: a.id,
    captured: a.latest ? await loadCaptured(a) : NO_CAPTURED_ANECDOTES,
  }),
)
const captured = computed(() => {
  const value = capture.data.value
  return value && value.accountId === account.value.id ? value.captured : null
})

const marks = useAnecdoteMarks(() => account.value.id, readOnly)

const ready = computed(
  () => !!game.data.value && !!captured.value && marks.loadedFor.value === account.value.id,
)
const loadError = computed(() => game.error.value ?? capture.error.value ?? marks.error.value)
function retry() {
  if (game.error.value) void game.reload()
  if (capture.error.value) void capture.reload()
  if (marks.error.value) void marks.reload()
}

const progress = computed(() =>
  game.data.value && captured.value
    ? anecdoteProgress(game.data.value.data, captured.value, marks.marked.value)
    : null,
)

const areaName = (id: number) => game.data.value?.text.areas.get(id) ?? `Area ${id}`
const areaTabs = computed<AreaTab[]>(
  () =>
    progress.value?.areas.map((a) => ({
      id: a.area,
      name: areaName(a.area),
      done: a.done,
      total: a.total,
      unlocked: a.unlocked,
    })) ?? [],
)

const newestCapture = computed(() => {
  const at = captured.value?.takenAt
  return at == null
    ? null
    : { iso: new Date(at).toISOString(), ago: formatRelative(at), title: formatDateTime(at) }
})

// ------------------------------------------------------------------ filters

const filters = reactive<AnecdoteFilters>({ ...DEFAULT_ANECDOTE_FILTERS })
const filtered = computed(() => hasAnecdoteFilters(filters))

/**
 * Done rows are soft-hidden in the All view: folded under each NPC, and NPCs
 * with nothing left sorted last as their heading. "Show done" (per device)
 * lists them in full; the Done filter always does.
 */
const SHOW_DONE_KEY = 'anecdotes:show-done'
const showDone = ref(readStorage(SHOW_DONE_KEY) === '1')
watch(showDone, (on) => writeStorage(SHOW_DONE_KEY, on ? '1' : null))
const fold = computed(() => filters.completion === 'all' && !showDone.value)

/** Rows toggled since the filters (or the folding) last changed stay where they were. */
const kept = shallowRef<ReadonlySet<number>>(new Set())
watch([filters, () => account.value.id, showDone], () => (kept.value = new Set()))

const shownAreas = computed(() => {
  const g = game.data.value
  const p = progress.value
  if (!g || !p) return []
  return filterAnecdotes(p, filters, g.text, kept.value)
})
const shownCount = computed(() => countShown(shownAreas.value))
const listedCount = computed(() =>
  countShown(shownAreas.value.map((area) => ({ ...area, shown: area.groups }))),
)
/** Areas to draw: those with rows, or the one chosen (its empty state). */
const drawnAreas = computed(() =>
  shownAreas.value
    .filter((area) => area.shown.length > 0 || filters.area !== null)
    .map((area) =>
      fold.value ? { ...area, shown: unfinishedFirst(area.shown, kept.value) } : area,
    ),
)
const empty = computed<'none' | 'unmet' | 'allDone' | 'noneDone' | null>(() => {
  if (shownCount.value > 0) return null
  if (filters.query.trim() !== '') return 'none'
  if (listedCount.value === 0) return 'unmet'
  return filters.completion === 'done' ? 'noneDone' : 'allDone'
})
function clearFilters() {
  filters.completion = 'all'
  filters.query = ''
}

// ------------------------------------------------------------------ marking

function keep(id: number) {
  if (filters.completion === 'all' && !fold.value) return
  kept.value = new Set([...kept.value, id])
}
function mark(id: number) {
  keep(id)
  void marks.change([id])
}
function unmark(id: number) {
  keep(id)
  void marks.change([], [id])
}
</script>

<template>
  <div>
    <PageHeader title="Anecdotes">
      <template v-if="ready && captured" #meta>
        <p v-if="newestCapture" class="flex items-center gap-1.5 text-text-secondary">
          <Clock class="size-4" aria-hidden="true" />
          <span class="sr-only">Newest capture</span>
          <time :datetime="newestCapture.iso" :title="`Newest capture: ${newestCapture.title}`">{{
            newestCapture.ago
          }}</time>
        </p>
        <p
          v-else
          class="flex items-center gap-1.5 text-text-secondary"
          title="No capture has anecdotes yet: irminsul records them from the game"
        >
          <Info class="size-4 shrink-0" aria-hidden="true" />
          Not captured
        </p>
      </template>
    </PageHeader>

    <UiError v-if="loadError && !ready" title="Load failed" :error="loadError" @retry="retry" />

    <template v-else-if="ready && progress && game.data.value && captured">
      <AnecdoteSummary
        class="mb-4 lg:mb-6"
        :progress="progress"
        :captured="captured"
        :reward-every="game.data.value.data.constants.rewardEvery"
        :reward-primogems="game.data.value.data.constants.rewardPrimogems"
      />

      <div class="flex flex-col gap-4">
        <AnecdoteToolbar
          v-model:filters="filters"
          v-model:show-done="showDone"
          :areas="areaTabs"
          :done="progress.done"
          :total="progress.total"
          :shown="shownCount"
          :listed="listedCount"
          :filtered="filtered"
          @clear="clearFilters"
        />

        <section
          v-for="area in drawnAreas"
          :key="area.area"
          class="flex flex-col gap-3"
          :aria-label="areaName(area.area)"
        >
          <header class="flex items-baseline gap-3 px-1">
            <h2 class="text-lg font-semibold">{{ areaName(area.area) }}</h2>
            <span
              class="tabular font-mono text-sm"
              :class="
                area.total > 0 && area.done >= area.total
                  ? 'text-success-text'
                  : 'text-text-secondary'
              "
              >{{ formatNumber(area.done) }} / {{ formatNumber(area.total) }}</span
            >
          </header>
          <div
            v-if="area.shown.length > 0"
            class="gap-3 md:columns-2 2xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid"
          >
            <AnecdoteGroup
              v-for="group in area.shown"
              :key="group.npc"
              :group="group"
              :text="game.data.value.text"
              :read-only="readOnly"
              :fold="fold"
              :kept="kept"
              @mark="mark"
              @unmark="unmark"
            />
          </div>
        </section>

        <UiPanel v-if="empty" flush>
          <UiEmpty v-if="empty === 'allDone'" title="All done">
            <template #icon><CheckCheck class="text-success-text" aria-hidden="true" /></template>
            <UiButton @click="filters.completion = 'done'">Show done</UiButton>
          </UiEmpty>
          <UiEmpty v-else-if="empty === 'noneDone'" title="None done">
            <template #icon><SearchX aria-hidden="true" /></template>
            <UiButton @click="filters.completion = 'missing'">Show not done</UiButton>
          </UiEmpty>
          <UiEmpty
            v-else-if="empty === 'unmet'"
            title="None met yet"
            body="Hidden anecdotes show once met."
          >
            <template #icon><SearchX aria-hidden="true" /></template>
          </UiEmpty>
          <UiEmpty v-else title="No matches">
            <template #icon><SearchX aria-hidden="true" /></template>
            <UiButton v-if="filtered" @click="clearFilters">Clear</UiButton>
          </UiEmpty>
        </UiPanel>
      </div>
    </template>

    <div v-else aria-busy="true" aria-label="Loading">
      <div class="mb-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:mb-6">
        <UiSkeleton v-for="n in 4" :key="n" class="h-16 sm:h-[4.5rem]" />
      </div>
      <div class="flex flex-col gap-4">
        <UiSkeleton class="h-28 w-full" />
        <div class="grid gap-3 md:grid-cols-2">
          <UiSkeleton v-for="n in 4" :key="n" class="h-48" />
        </div>
      </div>
    </div>
  </div>
</template>
