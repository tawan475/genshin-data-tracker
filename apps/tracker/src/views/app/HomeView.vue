<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import BaseTable, { type TableLabel } from '@/components/legacy/BaseTable.vue'
import { serverName } from '@/components/user/servers'
import { loadSnapshots } from '@/data/account-data'
import { accountTotals } from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatFullDateTime, formatNumber } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useSession } from '@/stores/session'

/**
 * The original "Overview" of the User section: totals across every Genshin
 * account, a card per account and the newest snapshots of all of them. The
 * old server computed this; here it comes from the account list (each
 * carries its latest summary) and the per-account snapshot lists.
 */
const accounts = useAccounts()
const session = useSession()
const router = useRouter()

// The router loaded the list once per session; refresh it so captures that
// Irminsul uploaded since then show up. On failure, keep what we have.
onMounted(() => {
  accounts.refresh().catch(() => undefined)
})

const accountName = (a: Pick<AccountResponse, 'id' | 'name'>) => a.name || `Account ${a.id}`

/** When Irminsul last synced the account: a new snapshot, or the same inventory seen again. */
const lastSync = (a: AccountResponse): number | null =>
  a.latest ? Math.max(a.latest.takenAt, a.latest.lastSeenAt) : null

const formatDate = (ms: number | null) => (ms === null ? '—' : formatFullDateTime(ms))

const summary = computed(() => {
  const list = accounts.list
  const totals = accountTotals(list)
  let totalArtifacts = 0
  let totalCharacters = 0
  let lastSyncAt: number | null = null
  for (const a of list) {
    totalArtifacts += a.latest?.summary.artifacts ?? 0
    totalCharacters += a.latest?.summary.characters ?? 0
    const at = lastSync(a)
    if (at !== null && (lastSyncAt === null || at > lastSyncAt)) lastSyncAt = at
  }
  return {
    totalAccounts: list.length,
    activeAccounts: list.filter((a) => a.snapshotCount > 0).length,
    totalSnapshots: totals.snapshots,
    totalArtifacts,
    totalCharacters,
    totalStorageBytes: totals.rawBytes,
    totalCompressedBytes: totals.storedBytes,
    lastSyncAt,
  }
})

/** Most recently synced first; accounts never synced last (as the old server sorted them). */
const cards = computed(() =>
  accounts.list
    .map((a) => ({
      id: a.id,
      name: accountName(a),
      uid: a.uid,
      server: serverName(a.server),
      snapshotCount: a.snapshotCount,
      characterCount: a.latest?.summary.characters ?? 0,
      artifactCount: a.latest?.summary.artifacts ?? 0,
      lastSyncAt: lastSync(a),
    }))
    .sort((a, b) => {
      if (a.lastSyncAt === null) return b.lastSyncAt === null ? 0 : 1
      if (b.lastSyncAt === null) return -1
      return b.lastSyncAt - a.lastSyncAt
    }),
)

interface ActivityRow {
  id: number
  accountId: number
  accountName: string
  takenAt: number
  characters: number
  artifacts: number
  fileSize: number
}

const RECENT_COUNT = 10

// Keyed on every account's data version: an import anywhere reloads the list.
const {
  data: activityData,
  error: activityFailure,
  loading: activityLoading,
} = useResource(
  () =>
    accounts.list
      .filter((a) => a.snapshotCount > 0)
      .map((a) => `${a.id}:${a.dataVersion}`)
      .join(','),
  async (): Promise<ActivityRow[]> => {
    const synced = accounts.list.filter((a) => a.snapshotCount > 0)
    const lists = await Promise.all(
      synced.map(async (a) => ({ account: a, snapshots: await loadSnapshots(a) })),
    )
    const rows: ActivityRow[] = []
    for (const { account, snapshots } of lists) {
      // Newest first already: no account can contribute more than RECENT_COUNT.
      for (const s of snapshots.slice(0, RECENT_COUNT)) {
        rows.push({
          id: s.id,
          accountId: account.id,
          accountName: accountName(account),
          takenAt: s.takenAt,
          characters: s.summary.characters,
          artifacts: s.summary.artifacts,
          fileSize: s.rawSize,
        })
      }
    }
    return rows.sort((a, b) => b.takenAt - a.takenAt).slice(0, RECENT_COUNT)
  },
)
const recentActivity = computed(() => activityData.value ?? [])
const activityError = computed(() => {
  const error = activityFailure.value
  if (!error) return null
  return error instanceof Error ? error.message : 'Failed to load recent activity'
})

const activityLabels: TableLabel[] = [
  { key: 'accountName', title: 'Account', slot: true },
  { key: 'createdAt', title: 'Date', slot: true },
  { key: 'characters', title: 'Characters', slot: true },
  { key: 'artifacts', title: 'Artifacts', slot: true },
  { key: 'fileSize', title: 'Size', slot: true },
]

const openAccount = (id: number) =>
  router.push({ name: 'account-overview', params: { accountId: id } })

const goToAccounts = () => router.push({ name: 'accounts' })
const addAccount = () => router.push({ name: 'account-new' })
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-slate-800 dark:text-white transition-colors">
        Welcome back{{ session.me?.username ? `, ${session.me.username}` : '' }}
      </h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 transition-colors">
        Your Genshin data at a glance across all accounts.
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Artifacts</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white">
          {{ summary.totalArtifacts.toLocaleString() }}
        </p>
      </div>
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
          Characters Synced
        </h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white">
          {{ summary.totalCharacters.toLocaleString() }}
        </p>
      </div>
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Active Accounts</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white">
          {{ summary.activeAccounts
          }}<span class="text-lg text-slate-400 font-normal"> / {{ summary.totalAccounts }}</span>
        </p>
      </div>
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Snapshots</h3>
        <p class="text-3xl font-bold text-slate-900 dark:text-white">
          {{ summary.totalSnapshots.toLocaleString() }}
        </p>
      </div>
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Storage Used</h3>
        <p class="text-2xl font-bold text-slate-900 dark:text-white">
          {{ formatBytes(summary.totalStorageBytes) }}
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {{ formatBytes(summary.totalCompressedBytes) }} compressed
        </p>
      </div>
      <div
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
      >
        <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Last Sync</h3>
        <p class="text-lg font-bold text-slate-900 dark:text-white">
          {{ formatDate(summary.lastSyncAt) }}
        </p>
      </div>
    </div>

    <section
      class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors"
    >
      <h2 class="text-base font-semibold text-slate-900 dark:text-white mb-4">Your accounts</h2>
      <div v-if="cards.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <button
          v-for="account in cards"
          :key="account.id"
          type="button"
          class="min-w-0 text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all bg-slate-50/50 dark:bg-slate-900/30"
          @click="openAccount(account.id)"
        >
          <div class="flex items-start justify-between gap-2 mb-2">
            <span class="font-semibold text-slate-900 dark:text-white truncate">
              {{ account.name }}
            </span>
            <ChevronRight class="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <p v-if="account.uid" class="text-xs text-slate-500 dark:text-slate-400 mb-2">
            UID {{ account.uid }}<template v-if="account.server"> · {{ account.server }}</template>
          </p>
          <div class="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span>{{ formatNumber(account.snapshotCount) }} snapshots</span>
            <span>{{ formatNumber(account.characterCount) }} chars</span>
            <span>{{ formatNumber(account.artifactCount) }} artifacts</span>
          </div>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Last sync: {{ formatDate(account.lastSyncAt) }}
          </p>
        </button>
      </div>
      <div v-else class="text-center text-slate-500 dark:text-slate-400 py-8">
        <p class="mb-4">You haven't added any Genshin accounts yet.</p>
        <BaseButton variant="primary" @click="addAccount">Add Account</BaseButton>
      </div>
    </section>

    <section
      class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors"
    >
      <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Recent sync activity</h2>
      </div>

      <div
        v-if="activityError && recentActivity.length === 0"
        class="m-6 text-center p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-400"
      >
        {{ activityError }}
      </div>

      <BaseTable
        v-else-if="recentActivity.length > 0 || activityLoading"
        :labels="activityLabels"
        :data="recentActivity"
        :is-loading="activityLoading && recentActivity.length === 0"
      >
        <template #accountName="{ item }">
          <button
            type="button"
            class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            @click="openAccount(item.accountId)"
          >
            {{ item.accountName }}
          </button>
        </template>
        <template #createdAt="{ item }">
          <span class="whitespace-nowrap text-slate-600 dark:text-slate-300">
            {{ formatDate(item.takenAt) }}
          </span>
        </template>
        <template #characters="{ item }">
          {{ item.characters }}
        </template>
        <template #artifacts="{ item }">
          {{ item.artifacts }}
        </template>
        <template #fileSize="{ item }">
          <span class="whitespace-nowrap text-slate-500 dark:text-slate-400">{{
            formatBytes(item.fileSize)
          }}</span>
        </template>
      </BaseTable>

      <div v-else class="p-6 text-center text-slate-500 dark:text-slate-400 py-12">
        <p class="mb-4">No recent activity found.</p>
        <BaseButton variant="primary" @click="goToAccounts">Go to Accounts & Keys</BaseButton>
      </div>
    </section>
  </div>
</template>
