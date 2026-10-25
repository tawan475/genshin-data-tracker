<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, shallowRef, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { Clock, Eye, History, Upload } from 'lucide-vue-next'
import ChangeValue from '@/components/overview/ChangeValue.vue'
import LowRarityStat from '@/components/overview/LowRarityStat.vue'
import DetailedProgression from '@/components/progression/DetailedProgression.vue'
import MonthlyAnalysisCard from '@/components/progression/MonthlyAnalysisCard.vue'
import OverviewSkeleton from '@/components/overview/OverviewSkeleton.vue'
import RecentSnapshots from '@/components/overview/RecentSnapshots.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiStat from '@/components/ui/UiStat.vue'
import LiveStrip from '@/components/live/LiveStrip.vue'
import SessionList from '@/components/snapshots/SessionList.vue'
import { loadLive, loadPoints, loadSnapshots } from '@/data/account-data'
import {
  buildHistory,
  currencyMissing,
  latestDelta,
  serverLabel,
  withPoints,
} from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { t } from '@/i18n'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useAccount } from './context'

/**
 * The account dashboard: latest figures, history charts, monthly analysis
 * and recent snapshots, all from snapshot summaries (nothing is decoded).
 */
const account = useAccount()
const accounts = useAccounts()
// Relative times ("3 hours ago") move on once a minute.
const nowMs = shallowRef(Date.now())
useIntervalFn(() => (nowMs.value = Date.now()), 60_000)

// Pick up captures uploaded since the account list was loaded (not when it
// was read just now, as on opening the app). A moved data version
// invalidates the snapshot cache below; a failure keeps what we have.
watch(
  () => account.value.id,
  (id) => {
    if (accounts.readWithin(30_000)) return
    accounts.reload(id).catch(() => undefined)
  },
  { immediate: true },
)

// Tagged with the account id, so switching accounts shows a skeleton rather
// than the previous account's history while the next one loads.
const { data, error, reload } = useResource(
  () => account.value,
  async (a): Promise<{ accountId: number; list: SnapshotResponse[] }> => ({
    accountId: a.id,
    list: await loadSnapshots(a),
  }),
)
const list = computed(() => {
  const value = data.value
  return value && value.accountId === account.value.id ? value.list : undefined
})

// Live sync: the open journal (null when off); re-read on every live event.
const live = useResource(
  () => account.value,
  (a) => loadLive(a),
)
// The strip's "updated 20 s ago" moves every 10 s while a journal is open.
const liveNow = shallowRef(Date.now())
useIntervalFn(() => (liveNow.value = Date.now()), 10_000)
/** The journal's figures when it follows the newest snapshot (the tiles show them). */
const liveFigures = computed(() => {
  const journal = live.data.value
  const latest = account.value.latest
  if (!journal?.open || !latest || journal.base?.snapshotId !== latest.id) return null
  return journal.changes?.length ? (journal.figures ?? null) : null
})

// Derived once per data version; the components below only read.
const history = computed(() => (list.value ? buildHistory(list.value) : null))
// Live sync's chart points between snapshots (none when it is off).
const points = useResource(
  () => account.value,
  (a) => loadPoints(a),
)
const chartCaptures = computed(() =>
  history.value ? withPoints(history.value.captures, points.data.value ?? []) : [],
)

/** Change since the previous snapshot: undefined while loading, null for the first one. */
const delta = computed(() => {
  const latest = account.value.latest
  const loaded = list.value
  if (!latest || !loaded || loaded[0]?.id !== latest.id) return undefined
  return latestDelta(loaded)
})

const tiles = computed(() => {
  const latestSummary = account.value.latest?.summary
  if (!latestSummary) return []
  // Live: the figures now, each against the newest snapshot.
  const figures = liveFigures.value
  const summary = figures ?? latestSummary
  const d = figures
    ? Object.fromEntries(
        Object.keys(figures).map((k) => [
          k,
          figures[k as keyof typeof figures] - latestSummary[k as keyof typeof latestSummary],
        ]),
      )
    : delta.value

  // When the newest capture lacks currency, show the last known figures
  // (history carries them over) rather than a false 0.
  let currency: { mora: number | null; primogem: number | null; detail?: string } = {
    mora: summary.mora,
    primogem: summary.primogem,
  }
  if (currencyMissing(summary)) {
    const captures = history.value?.captures
    const carried = captures?.[captures.length - 1]?.summary
    currency =
      carried && !currencyMissing(carried)
        ? { mora: carried.mora, primogem: carried.primogem, detail: t('overview.currencyCarried') }
        : { mora: null, primogem: null, detail: t('overview.currencyMissing') }
  }

  return [
    {
      label: t('overview.figure.mora'),
      value: currency.mora,
      delta: d?.mora,
      detail: currency.detail,
    },
    {
      label: t('overview.figure.primogem'),
      value: currency.primogem,
      delta: d?.primogem,
      detail: currency.detail,
    },
    { label: t('overview.figure.characters'), value: summary.characters, delta: d?.characters },
    { label: t('overview.figure.weapons'), value: summary.weapons, delta: d?.weapons },
    { label: t('overview.figure.artifacts'), value: summary.artifacts, delta: d?.artifacts },
  ]
})
const lowRarity = computed(() => {
  const summary = liveFigures.value ?? account.value.latest?.summary
  if (!summary) return null
  const d = liveFigures.value ? undefined : delta.value
  return {
    artifact4: summary.artifact4,
    artifact3: summary.artifact3,
    delta4: d?.artifact4,
    delta3: d?.artifact3,
  }
})

interface MetaItem {
  key: string
  text?: string
  mono?: boolean
  icon?: typeof Clock
  label?: string
  time?: { iso: string; ago: string; title: string }
}

/** UID · server · [clock] 3 days ago · [eye] 2 hours ago. */
const meta = computed<MetaItem[]>(() => {
  const a = account.value
  const latest = a.latest
  const items: MetaItem[] = []
  if (a.uid) items.push({ key: 'uid', text: a.uid, mono: true })
  const server = serverLabel(a.server)
  if (server) items.push({ key: 'server', text: server })
  if (!latest) return items
  const moment = (ms: number, key: 'overview.lastCapturedAt' | 'overview.seenAgainAt') => ({
    iso: new Date(ms).toISOString(),
    ago: formatRelative(ms, nowMs.value),
    title: t(key, { time: formatDateTime(ms) }),
  })
  items.push({
    key: 'captured',
    icon: Clock,
    label: t('overview.lastCaptured'),
    time: moment(latest.takenAt, 'overview.lastCapturedAt'),
  })
  if (latest.lastSeenAt > latest.takenAt) {
    items.push({
      key: 'seen',
      icon: Eye,
      label: t('overview.seenAgain'),
      time: moment(latest.lastSeenAt, 'overview.seenAgainAt'),
    })
  }
  return items
})

const importRoute = computed(() => ({
  name: 'account-import',
  params: { accountId: account.value.id },
}))
</script>

<template>
  <PageHeader :title="accounts.displayName(account)">
    <template #meta>
      <p v-if="meta.length" class="mt-1 flex flex-wrap items-center text-text-secondary">
        <template v-for="(item, index) in meta" :key="item.key">
          <span v-if="index" class="px-2" aria-hidden="true">·</span>
          <span
            class="inline-flex items-center gap-1.5"
            :class="item.mono ? 'tabular font-mono' : ''"
          >
            <component :is="item.icon" v-if="item.icon" class="size-4" aria-hidden="true" />
            <span v-if="item.label" class="sr-only">{{ item.label }}</span>
            <time v-if="item.time" :datetime="item.time.iso" :title="item.time.title">{{
              item.time.ago
            }}</time>
            <template v-else>{{ item.text }}</template>
          </span>
        </template>
      </p>
    </template>
  </PageHeader>

  <UiPanel v-if="!account.latest" flush>
    <UiEmpty :title="$t('overview.noSnapshots')">
      <template #icon><History aria-hidden="true" /></template>
      <UiButton variant="primary" :to="importRoute">
        <Upload class="size-4" aria-hidden="true" />
        {{ $t('overview.import') }}
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <template v-else>
    <LiveStrip v-if="list" class="mb-3" :live="live.data.value" :snapshots="list" :now="liveNow" />
    <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <UiStat
        v-for="tile in tiles"
        :key="tile.label"
        :label="tile.label"
        :value="tile.value"
        :detail="tile.detail"
      >
        <span class="min-h-5 text-sm leading-5">
          <ChangeValue
            v-if="tile.delta !== undefined && tile.delta !== null"
            :value="tile.delta"
            :hint="liveFigures ? $t('live.sinceSnapshot') : $t('overview.sincePrevious')"
          />
        </span>
      </UiStat>
      <LowRarityStat
        v-if="lowRarity"
        :artifact4="lowRarity.artifact4"
        :artifact3="lowRarity.artifact3"
        :delta4="lowRarity.delta4"
        :delta3="lowRarity.delta3"
      />
    </div>

    <UiError
      v-if="error"
      class="mt-6"
      :title="$t('overview.historyUnavailable')"
      :error="error"
      @retry="reload"
    />

    <div v-if="list && history?.captures.length" class="mt-6 flex flex-col gap-6">
      <SessionList :snapshots="list" :live="live.data.value" :account="account" :limit="1" />
      <DetailedProgression
        :captures="chartCaptures"
        :title="$t('overview.progression')"
        storage="overview-progression"
        :defaults="['mora', 'primogem']"
        default-group="snapshot"
      />
      <!-- The monthly table is wide: side by side only where it fits whole. -->
      <div class="flex flex-wrap items-start gap-6">
        <MonthlyAnalysisCard :snapshots="list" class="min-w-0 flex-[999_1_52rem]" />
        <RecentSnapshots
          :snapshots="list"
          :account-id="account.id"
          :now="nowMs"
          class="min-w-0 flex-[1_1_20rem]"
        />
      </div>
    </div>
    <OverviewSkeleton v-else-if="!error && !list" class="mt-6" />
  </template>
</template>
