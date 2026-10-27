<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GiProgress, GiProgressState } from '@gdt/shared'
import NotCaptured from './NotCaptured.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { ChevronRight, SearchX } from 'lucide-vue-next'
import type { CapturedCollections } from '@/data/collections'
import { handbookNames, type CollectionCatalog } from '@/data/collection-names'
import { formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { t } from '@/i18n'

/**
 * The Adventurer Handbook: each chapter's progress and state, its targets
 * under it, filtered by state (open / complete = reward waiting / claimed).
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog }>()

type Filter = 'all' | GiProgressState
const FILTERS: Filter[] = ['all', 'open', 'complete', 'claimed']
const KEY = 'collections:handbook'
const stored = readStorage(KEY) as Filter | null
const filter = ref<Filter>(stored && FILTERS.includes(stored) ? stored : 'all')
watch(filter, (value) => writeStorage(KEY, value === 'all' ? null : value))

const handbook = computed(() => props.captured.handbook?.value ?? null)
const targets = computed(() =>
  Object.entries(handbook.value?.targets ?? {}).map(([id, target]) => ({
    id: Number(id),
    ...target,
  })),
)
const counts = computed(() => {
  const out = { all: targets.value.length, open: 0, complete: 0, claimed: 0 }
  for (const target of targets.value) out[target.state]++
  return out
})
const options = computed<SegmentedOption<Filter>[]>(() =>
  FILTERS.map((value) => ({
    value,
    label: t(`collections.handbook.filters.${value}`),
    count: counts.value[value],
  })),
)

const names = computed(() => handbookNames(props.catalog))
const chapters = computed(() =>
  Object.entries(handbook.value?.chapters ?? {})
    .map(([id, chapter]) => ({
      id: Number(id),
      ...chapter,
      name: names.value.chapter(Number(id)),
      targets: targets.value
        .filter((tg) => tg.chapter === Number(id))
        .filter((tg) => filter.value === 'all' || tg.state === filter.value)
        .map((tg) => ({ ...tg, name: names.value.target(tg.id).name })),
    }))
    .filter((chapter) => filter.value === 'all' || chapter.targets.length > 0)
    .sort((a, b) => a.id - b.id),
)
const chaptersDone = computed(
  () => Object.values(handbook.value?.chapters ?? {}).filter((c) => c.state === 'claimed').length,
)

const TONE = { open: 'neutral', complete: 'accent', claimed: 'success' } as const
const stateLabel = (state: GiProgressState) => t(`collections.handbook.states.${state}`)
const progressText = (p: GiProgress) => `${formatNumber(p.progress)} / ${formatNumber(p.total)}`
</script>

<template>
  <NotCaptured v-if="!handbook" :title="$t('collections.tabs.handbook')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.handbook.chapters')">
          <template #value>
            <span class="tabular truncate font-mono text-lg font-medium sm:text-xl">
              {{ formatNumber(chaptersDone)
              }}<span class="text-sm text-text-muted">
                / {{ formatNumber(Object.keys(handbook.chapters).length) }}</span
              >
            </span>
          </template>
        </UiStat>
      </li>
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.handbook.waiting')"
          :value="counts.complete"
          exact
          :hint="$t('collections.handbook.waitingHint')"
        />
      </li>
    </ul>

    <div
      class="scroll-hide scroll-fade-x -mx-3 flex overflow-x-auto px-3 sm:mx-0 sm:justify-end sm:overflow-visible sm:px-0 sm:scroll-fade-none"
    >
      <UiSegmented v-model="filter" :options="options" :label="$t('collections.handbook.show')" />
    </div>

    <!-- Folded to their progress in the All view, but for rewards waiting; a filter unfolds them. -->
    <div
      v-if="chapters.length > 0"
      class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] items-start gap-3"
    >
      <details
        v-for="chapter in chapters"
        :key="`${chapter.id}:${filter}`"
        class="group rounded-xl border border-border-default bg-surface-raised shadow-sm"
        :open="filter !== 'all' || chapter.targets.some((tg) => tg.state === 'complete')"
      >
        <summary class="flex cursor-pointer list-none flex-col gap-1.5 px-4 py-3">
          <span class="flex min-w-0 items-center gap-2">
            <ChevronRight
              class="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span
              class="min-w-0 flex-1 truncate font-semibold"
              :class="chapter.name.startsWith('#') && 'tabular font-mono'"
              :title="chapter.name"
              >{{ chapter.name }}</span
            >
            <span class="tabular shrink-0 font-mono text-sm text-text-secondary">{{
              progressText(chapter)
            }}</span>
            <UiBadge :tone="TONE[chapter.state]">{{ stateLabel(chapter.state) }}</UiBadge>
          </span>
          <UiProgress
            :value="chapter.progress"
            :max="chapter.total"
            :label="`${chapter.name}: ${progressText(chapter)}`"
          />
        </summary>
        <ul class="divide-y divide-border-subtle border-t border-border-default">
          <li
            v-for="target in chapter.targets"
            :key="target.id"
            class="flex min-w-0 items-center gap-2 px-4 py-2 text-sm"
            :title="`${target.name} · ${stateLabel(target.state)}`"
          >
            <span
              class="line-clamp-2 min-w-0 flex-1 text-text-secondary"
              :class="target.name.startsWith('#') && 'tabular font-mono'"
              >{{ target.name }}</span
            >
            <span class="tabular shrink-0 font-mono">{{ progressText(target) }}</span>
            <UiBadge :tone="TONE[target.state]">{{ stateLabel(target.state) }}</UiBadge>
          </li>
        </ul>
      </details>
    </div>
    <UiPanel v-else flush>
      <UiEmpty :title="$t('collections.handbook.noneShown')">
        <template #icon><SearchX aria-hidden="true" /></template>
      </UiEmpty>
    </UiPanel>
  </div>
</template>
