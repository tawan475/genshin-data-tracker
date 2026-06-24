<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-white transition-colors">Export</h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 transition-colors">
        Export your latest account data to external tools or download bulk snapshot exports
      </p>
    </div>

    <div
      v-if="!genshinStore.selectedAccountId"
      class="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-500 p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/50 transition-colors"
    >
      Please select an account first from the dashboard.
    </div>

    <div v-else class="space-y-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Card 1: Optimizer -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
            >
              <Icon icon="mdi:calculator-variant-outline" class="w-6 h-6" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Optimizer</h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your latest account data directly into the Genshin Optimizer format to calculate your
            best builds.
          </p>
          <BaseButton
            variant="blue"
            block
            size="lg"
            :loading="isClipboardExporting"
            @click="exportData('https://frzyc.github.io/genshin-optimizer/#/setting')"
          >
            Export Latest Data to Genshin Optimizer
          </BaseButton>
        </div>

        <!-- Card 2: Planner -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
            >
              <Icon icon="mdi:calendar-check-outline" class="w-6 h-6" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Planner</h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your latest account data to Seelie.me for tracking inventory and farming materials.
          </p>
          <BaseButton
            variant="emerald"
            block
            size="lg"
            :loading="isClipboardExporting"
            @click="exportData('https://seelie.me/inventory')"
          >
            Export Latest Data to Seelie.me
          </BaseButton>
        </div>

        <!-- Card 3: Achievement -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-lg transition-colors"
            >
              <Icon icon="mdi:trophy-outline" class="w-6 h-6" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">Achievement</h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your achievements tracking to Stardb.gg or Seelie.me.
          </p>
          <div class="space-y-3">
            <BaseButton
              variant="purple"
              block
              size="lg"
              :loading="isClipboardExporting"
              @click="exportData('https://stardb.gg/en/import')"
            >
              Export Latest data to Stardb.gg
            </BaseButton>
            <BaseButton
              variant="secondary"
              block
              size="lg"
              :loading="isClipboardExporting"
              @click="exportData('https://seelie.me/achievements')"
            >
              Export Latest data to Seelie.me
            </BaseButton>
          </div>
        </div>
      </div>

      <!-- Bulk export history -->
      <section
        class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors"
      >
        <div class="mb-4">
          <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">
            Bulk export history
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Completed exports expire after the retention period; expired entries stay in history but can no longer be downloaded.
          </p>
        </div>

        <BaseTable
          :labels="historyLabels"
          :data="historyItems"
          :is-loading="historyLoading"
          :meta="historyMeta"
          @page-change="(p) => fetchHistory(p)"
        >
          <template #createdAt="{ item }">
            <span
              class="font-medium whitespace-nowrap"
              :class="{
                'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-800 rounded px-1':
                  item.jobId === highlightJobId,
              }"
            >
              {{ formatDate(item.createdAt) }}
            </span>
          </template>

          <template #snapshots="{ item }">
            <span class="font-medium">{{ item.total }} snapshots</span>
          </template>

          <template #status="{ item }">
            <span
              class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold"
              :class="statusClass(item.status)"
            >
              {{ item.status }}
            </span>
            <div
              v-if="item.status === 'PROCESSING' || item.status === 'PENDING'"
              class="mt-1 text-xs text-slate-500 dark:text-slate-400"
            >
              {{ item.progress }} / {{ item.total }}
            </div>
          </template>

          <template #expires="{ item }">
            <span class="text-sm text-slate-500 dark:text-slate-400">{{
              formatExpiry(item.expiresAt, item.status)
            }}</span>
          </template>

          <template #actions="{ item }">
            <BaseButton
              v-if="item.downloadReady"
              size="xs"
              variant="primary"
              @click="handleDownload(item)"
            >
              Download
            </BaseButton>
            <span v-else class="text-sm text-slate-400 dark:text-slate-500">—</span>
          </template>

          <template #empty>
            <div class="py-8 text-center text-slate-500 dark:text-slate-400">
              No bulk exports yet. Select snapshots on Import History and click Download.
            </div>
          </template>
        </BaseTable>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import BaseButton from '../../components/BaseButton.vue'
import BaseTable, { type TableLabel } from '../../components/BaseTable.vue'
import { useGenshinStore } from '../../stores/genshin'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'
import { useExportHistory, type ExportJobItem } from '../../composables/useExportHistory'
import { formatExpiry } from '../../utils/export'
import { swalError, swalToast } from '../../utils/swal'

const genshinStore = useGenshinStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()

const isClipboardExporting = ref(false)
const highlightJobId = computed(() => route.query.jobId as string | undefined)

const accountId = computed(() => genshinStore.selectedAccountId)

const {
  items: historyItems,
  isLoading: historyLoading,
  meta: historyMeta,
  fetchHistory,
  downloadJob,
} = useExportHistory(accountId, highlightJobId, {
  onJobReady: async () => {
    swalToast('Export ready — click Download when you want the file', 'success')
    if (route.query.jobId) {
      await router.replace({ name: 'export', query: {} })
    }
  },
})

const historyLabels: TableLabel[] = [
  { key: 'createdAt', title: 'Created', slot: true },
  { key: 'snapshots', title: 'Snapshots', slot: true },
  { key: 'status', title: 'Status', slot: true },
  { key: 'expires', title: 'Expires', slot: true },
  { key: 'actions', title: 'Actions', slot: true },
]

const formatDate = (d: string) =>
  new Date(d).toLocaleString(undefined, { hour12: !settingsStore.use24Hour })

const statusClass = (status: string) => {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    case 'PROCESSING':
    case 'PENDING':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case 'EXPIRED':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-400'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  }
}

const handleDownload = async (item: ExportJobItem) => {
  try {
    await downloadJob(item)
    swalToast('Export downloaded', 'success')
  } catch {
    swalError('Error', 'Failed to download export')
  }
}

const exportData = async (url: string) => {
  if (!genshinStore.selectedAccountId) return

  isClipboardExporting.value = true
  try {
    const res = await authStore.fetchWithAuth(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/export/latest`,
    )

    if (res.ok) {
      const responseData = await res.json()
      const exportJson = responseData.data ? responseData.data : responseData
      await navigator.clipboard.writeText(JSON.stringify(exportJson))
      window.open(url, '_blank')
    } else {
      swalError('Error', 'Failed to export data')
    }
  } catch (err) {
    console.error('Export error', err)
    swalError('Error', 'An error occurred while exporting.')
  } finally {
    isClipboardExporting.value = false
  }
}
</script>
