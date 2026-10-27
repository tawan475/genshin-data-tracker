<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { CalendarDays, Gift } from 'lucide-vue-next'
import type { GameEventsResponse, GameNotice } from '@gdt/shared'
import NotCaptured from './NotCaptured.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiStat from '@/components/ui/UiStat.vue'
import type { CapturedCollections } from '@/data/collections'
import { nameOf, idLabel, type CollectionCatalog } from '@/data/collection-names'
import { loadGameEvents } from '@/data/domain-events'
import { eventRows } from '@/data/events'
import { locale } from '@/i18n/locale'
import { formatDate, formatDateTime } from '@/lib/format'
import { useAccount } from '@/views/account/context'
import { t } from '@/i18n'

/**
 * Events (Capture 1.7.0's `gi_events`): each event in the newest capture with
 * its window and reward counters, running ones first, named by the game data
 * (else the notice board, where one notice matches the event's dates).
 */
const props = defineProps<{ captured: CapturedCollections; catalog: CollectionCatalog }>()

const account = useAccount()
const events = computed(() => props.captured.events?.value ?? null)
const board = shallowRef<GameEventsResponse | null>(null)
watch(
  () => account.value.server,
  (server) => void loadGameEvents(server).then((value) => (board.value = value)),
  { immediate: true },
)
const title = (notice: GameNotice) => notice.title[locale.value] || notice.title.en
const rows = computed(() =>
  events.value
    ? eventRows(events.value, board.value?.notices ?? [], title, Date.now(), (id) => {
        const name = nameOf(props.catalog, 'events', id)
        return name === idLabel(id) ? '' : name
      })
    : [],
)
const running = computed(() => rows.value.filter((r) => r.running))
const waiting = computed(() => running.value.reduce((sum, r) => sum + r.waiting, 0))
const window = (start: number, end: number) =>
  t('collections.events.window', { start: formatDate(start), end: formatDate(end) })
</script>

<template>
  <NotCaptured v-if="!events" :title="$t('collections.tabs.events')" />
  <div v-else class="flex flex-col gap-4">
    <ul
      class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4"
      :aria-label="$t('collections.summary')"
    >
      <li class="flex min-w-0">
        <UiStat :label="$t('collections.events.running')" :value="running.length" exact />
      </li>
      <li class="flex min-w-0">
        <UiStat
          :label="$t('collections.events.waiting')"
          :value="waiting"
          exact
          :hint="$t('collections.events.waitingHint')"
        />
      </li>
    </ul>

    <UiPanel :title="$t('collections.tabs.events')" flush>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3 p-3 sm:p-5">
        <li
          v-for="row in rows"
          :key="row.id"
          class="flex min-w-0 flex-col gap-2 rounded-xl border border-border-default bg-surface-sunken p-3"
          :class="row.running ? '' : 'opacity-60'"
        >
          <div class="flex min-w-0 items-start gap-2">
            <CalendarDays class="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <h3
              class="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold"
              :title="row.name ?? undefined"
            >
              {{ row.name ?? $t('collections.events.unnamed', { n: row.id }) }}
            </h3>
            <UiBadge v-if="row.waiting" tone="accent" :title="$t('collections.events.waitingHint')"
              ><Gift class="size-3" aria-hidden="true" />{{ row.waiting }}</UiBadge
            >
          </div>
          <p
            class="text-xs text-text-secondary"
            :title="`${formatDateTime(row.start)} – ${formatDateTime(row.end)}`"
          >
            {{ window(row.start, row.end) }}
            <template v-if="!row.running"> · {{ $t('collections.events.ended') }}</template>
          </p>
          <template v-if="row.total">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="text-text-secondary">{{ $t('collections.events.claimed') }}</span>
              <span class="tabular font-mono"
                >{{ row.claimed }}<span class="text-text-muted"> / {{ row.total }}</span></span
              >
            </div>
            <UiProgress
              :value="row.claimed"
              :max="row.total"
              :label="`${row.name ?? row.id} · ${$t('collections.events.claimed')}`"
            />
          </template>
        </li>
      </ul>
    </UiPanel>
  </div>
</template>
