<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, shallowRef, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { Clock, Eye, History, Upload } from 'lucide-vue-next'
import LowRarityStat from '@/components/overview/LowRarityStat.vue'
import HistoryCharts from '@/components/overview/HistoryCharts.vue'
import MonthlyAnalysis from '@/components/overview/MonthlyAnalysis.vue'
import OverviewSkeleton from '@/components/overview/OverviewSkeleton.vue'
import RecentSnapshots from '@/components/overview/RecentSnapshots.vue'
import StatTile from '@/components/overview/StatTile.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { loadSnapshots } from '@/data/account-data'
import { buildHistory, currencyMissing, latestDelta, serverLabel } from '@/data/overview'
import { useResource } from '@/data/use-resource'
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

// Pick up captures uploaded since the account list was loaded. A moved data
// version invalidates the snapshot cache below; a failure keeps what we have.
watch(
  () => account.value.id,
  (id) => {
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

// Derived once per data version; the components below only read.
const history = computed(() => (list.value ? buildHistory(list.value) : null))

/** Change since the previous snapshot: undefined while loading, null for the first one. */
const delta = computed(() => {
  const latest = account.value.latest
  const loaded = list.value
  if (!latest || !loaded || loaded[0]?.id !== latest.id) return undefined
  return latestDelta(loaded)
})

const tiles = computed(() => {
  const summary = account.value.latest?.summary
  if (!summary) return []
  const d = delta.value

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
        ? { mora: carried.mora, primogem: carried.primogem, detail: 'from an earlier capture' }
        : { mora: null, primogem: null, detail: 'missing from the latest capture' }
  }

  return [
    { label: 'Mora', value: currency.mora, delta: d?.mora, detail: currency.detail },
    { label: 'Primogems', value: currency.primogem, delta: d?.primogem, detail: currency.detail },
    { label: 'Characters', value: summary.characters, delta: d?.characters },
    { label: 'Weapons', value: summary.weapons, delta: d?.weapons },
    { label: 'Artifacts', value: summary.artifacts, delta: d?.artifacts },
  ]
})
const lowRarity = computed(() => {
  const summary = account.value.latest?.summary
  if (!summary) return null
  const d = delta.value
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
  const moment = (ms: number, label: string) => ({
    iso: new Date(ms).toISOString(),
    ago: formatRelative(ms, nowMs.value),
    title: `${label} ${formatDateTime(ms)}`,
  })
  items.push({
    key: 'captured',
    icon: Clock,
    label: 'Last captured',
    time: moment(latest.takenAt, 'Last captured'),
  })
  if (latest.lastSeenAt > latest.takenAt) {
    items.push({
      key: 'seen',
      icon: Eye,
      label: 'Seen again',
      time: moment(latest.lastSeenAt, 'Seen again'),
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
    <UiEmpty title="No snapshots yet">
      <template #icon><History aria-hidden="true" /></template>
      <UiButton variant="primary" :to="importRoute">
        <Upload class="size-5" aria-hidden="true" />
        Import
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <template v-else>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile
        v-for="tile in tiles"
        :key="tile.label"
        :label="tile.label"
        :value="tile.value"
        :delta="tile.delta"
        :detail="tile.detail"
      />
      <LowRarityStat
        v-if="lowRarity"
        :artifact4="lowRarity.artifact4"
        :artifact3="lowRarity.artifact3"
        :delta4="lowRarity.delta4"
        :delta3="lowRarity.delta3"
      />
    </div>

    <UiError v-if="error" class="mt-6" title="History unavailable" :error="error" @retry="reload" />

    <div v-if="list && history?.captures.length" class="mt-6 flex flex-col gap-6">
      <HistoryCharts :captures="history.captures" />
      <div class="grid items-start gap-6 xl:grid-cols-3">
        <MonthlyAnalysis :days="history.days" class="min-w-0 xl:col-span-2" />
        <RecentSnapshots :snapshots="list" :account-id="account.id" :now="nowMs" class="min-w-0" />
      </div>
    </div>
    <OverviewSkeleton v-else-if="!error && !list" class="mt-6" />
  </template>
</template>
