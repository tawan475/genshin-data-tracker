<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import BaseTable, { type TableLabel } from '../../components/BaseTable.vue'
import BaseButton from '../../components/BaseButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import { useSettingsStore } from '../../stores/settings'
import { useDashboardSummary } from '../../composables/useDashboardSummary'
import { useActiveExport } from '../../composables/useActiveExport'
import { formatBytes } from '../../utils/format'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const { data, isLoading, error } = useDashboardSummary()
const { inProgress: hasActiveExport, activeJob, fetchActiveExport } = useActiveExport()

onMounted(() => {
  fetchActiveExport()
})

const summary = computed(() => data.value?.summary)
const accounts = computed(() => data.value?.accounts ?? [])
const recentActivity = computed(() => data.value?.recentActivity ?? [])

const activityLabels: TableLabel[] = [
  { key: 'accountName', title: 'Account', slot: true },
  { key: 'createdAt', title: 'Date', slot: true },
  { key: 'characters', title: 'Characters', slot: true },
  { key: 'artifacts', title: 'Artifacts', slot: true },
  { key: 'fileSize', title: 'Size', slot: true },
]

const formatDate = (d: string | null) => {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { hour12: !settingsStore.use24Hour })
}

const serverLabel = (server: string | null) => {
  if (!server) return ''
  const labels: Record<string, string> = {
    ASIA: 'Asia',
    AMERICA: 'America',
    EUROPE: 'Europe',
    SAR: 'TW/HK/MO',
  }
  return labels[server] ?? server
}

const openAccount = (account: { id: number; accountName: string | null }) => {
  genshinStore.selectAccount(account.id, account.accountName ?? `Account ${account.id}`)
  router.push({ name: 'account-overview' })
}

const goToAccounts = () => router.push({ name: 'dashboard-accounts' })
const goToExport = () => router.push({ name: 'export' })
</script>

<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-slate-800 dark:text-white transition-colors">
        Welcome back{{ authStore.user?.username ? `, ${authStore.user.username}` : '' }}
      </h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 transition-colors">
        Your Genshin data at a glance across all accounts.
      </p>
    </div>

    <div
      v-if="hasActiveExport && activeJob"
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl transition-colors"
    >
      <div class="text-sm text-indigo-900 dark:text-indigo-200">
        <span class="font-semibold">Export in progress</span>
        — {{ activeJob.progress }} / {{ activeJob.total }} snapshots
      </div>
      <BaseButton size="sm" variant="primary" @click="goToExport">
        View on Export page
      </BaseButton>
    </div>

    <div v-if="isLoading" class="flex justify-center p-12">
      <span
        class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin transition-colors"
      />
    </div>

    <div
      v-else-if="error"
      class="text-center p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-xl text-red-700 dark:text-red-400"
    >
      {{ error }}
    </div>

    <template v-else-if="summary">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
        >
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Total Artifacts
          </h3>
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
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Active Accounts
          </h3>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ summary.activeAccounts }}<span class="text-lg text-slate-400 font-normal"> / {{ summary.totalAccounts }}</span>
          </p>
        </div>
        <div
          class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
        >
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Total Snapshots
          </h3>
          <p class="text-3xl font-bold text-slate-900 dark:text-white">
            {{ summary.totalSnapshots.toLocaleString() }}
          </p>
        </div>
        <div
          class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm transition-colors"
        >
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Storage Used
          </h3>
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
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
            Last Sync
          </h3>
          <p class="text-lg font-bold text-slate-900 dark:text-white">
            {{ formatDate(summary.lastSyncAt) }}
          </p>
        </div>
      </div>

      <section
        v-if="accounts.length > 0"
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors"
      >
        <h2 class="text-base font-semibold text-slate-900 dark:text-white mb-4">
          Your accounts
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            v-for="account in accounts"
            :key="account.id"
            type="button"
            class="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all bg-slate-50/50 dark:bg-slate-900/30"
            @click="openAccount(account)"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <span class="font-semibold text-slate-900 dark:text-white truncate">
                {{ account.accountName || `Account ${account.id}` }}
              </span>
              <Icon icon="mdi:chevron-right" class="w-5 h-5 text-slate-400 shrink-0" />
            </div>
            <p v-if="account.uid" class="text-xs text-slate-500 dark:text-slate-400 mb-2">
              UID {{ account.uid }} · {{ serverLabel(account.server) }}
            </p>
            <div class="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
              <span>{{ account.snapshotCount }} snapshots</span>
              <span>{{ account.characterCount }} chars</span>
              <span>{{ account.artifactCount }} artifacts</span>
            </div>
            <p class="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Last sync: {{ formatDate(account.lastSyncAt) }}
            </p>
          </button>
        </div>
      </section>

      <section
        class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors"
      >
        <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <h2 class="text-base font-semibold text-slate-900 dark:text-white">
            Recent sync activity
          </h2>
        </div>

        <BaseTable
          v-if="recentActivity.length > 0"
          :labels="activityLabels"
          :data="recentActivity"
          :is-loading="false"
        >
          <template #accountName="{ item }">
            <button
              type="button"
              class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              @click="openAccount({ id: item.genshinAccountId, accountName: item.accountName })"
            >
              {{ item.accountName || `Account ${item.genshinAccountId}` }}
            </button>
          </template>
          <template #createdAt="{ item }">
            <span class="whitespace-nowrap text-slate-600 dark:text-slate-300">
              {{ formatDate(item.createdAt) }}
            </span>
          </template>
          <template #characters="{ item }">
            {{ item._count.characters }}
          </template>
          <template #artifacts="{ item }">
            {{ item._count.artifacts }}
          </template>
          <template #fileSize="{ item }">
            <span class="text-slate-500 dark:text-slate-400">{{ formatBytes(item.fileSize) }}</span>
          </template>
        </BaseTable>

        <div v-else class="p-6 text-center text-slate-500 dark:text-slate-400 py-12">
          <p class="mb-4">No recent activity found.</p>
          <BaseButton variant="primary" @click="goToAccounts">
            Go to Accounts & Keys
          </BaseButton>
        </div>
      </section>
    </template>
  </div>
</template>
