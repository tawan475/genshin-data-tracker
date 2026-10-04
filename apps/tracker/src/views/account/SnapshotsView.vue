<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import { api } from '@/api'
import BaseButton from '@/components/legacy/BaseButton.vue'
import type { PaginationMeta } from '@/components/legacy/BasePagination.vue'
import BaseTable, { type TableLabel } from '@/components/legacy/BaseTable.vue'
import ItemDisplay from '@/components/legacy/ItemDisplay.vue'
import MoraDisplay from '@/components/legacy/MoraDisplay.vue'
import ConfirmDialog from '@/components/snapshot-history/ConfirmDialog.vue'
import StorageStrip from '@/components/snapshot-history/StorageStrip.vue'
import UiError from '@/components/ui/UiError.vue'
import { useSnapshotSelection } from '@/composables/useSnapshotSelection'
import { loadSnapshots } from '@/data/account-data'
import { downloadSnapshotGood, exportJob, exportZip } from '@/data/export'
import { currencyMissing, dayKey } from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatFullDateTime, formatNumber } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/** The bulk delete endpoint takes at most this many ids per request. */
const DELETE_BATCH = 1000

const account = useAccount()
const accounts = useAccounts()
const feedback = useFeedback()

const {
  data: snapshots,
  error,
  loading: isLoading,
  reload,
} = useResource(
  () => account.value,
  (value) => loadSnapshots(value),
)

/** Every snapshot, newest first; the table pages through it in the browser. */
const list = computed<readonly SnapshotResponse[]>(() => snapshots.value ?? [])
const page = ref(1)
const limit = ref(20)

const meta = computed<PaginationMeta>(() => {
  const total = list.value.length
  const totalPages = Math.max(1, Math.ceil(total / limit.value))
  return { page: Math.min(page.value, totalPages), limit: limit.value, totalPages, total }
})
const rows = computed(() => {
  const start = (meta.value.page - 1) * meta.value.limit
  return list.value.slice(start, start + meta.value.limit)
})

const baseTableRef = ref<InstanceType<typeof BaseTable> | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const totalCount = computed(() => meta.value.total)
const {
  selectAll,
  toggleSelectAll,
  toggleSelection,
  isSelected,
  selectedCount,
  selectedIdList,
  retain,
  resetSelection,
} = useSnapshotSelection(list, totalCount)

// The view is reused when switching accounts: start over.
watch(
  () => account.value.id,
  () => {
    page.value = 1
    resetSelection()
  },
)

// Snapshots deleted here or elsewhere leave the selection.
watch(list, (live) => retain(new Set(live.map((s) => s.id))))

/** The header checkbox; nothing to select in an empty list. */
const onHeaderToggle = () => {
  if (list.value.length > 0 || selectAll.value) toggleSelectAll()
}

const onPageChange = (p: number) => {
  page.value = p
}

const onLimitChange = (l: number) => {
  limit.value = l
  page.value = 1
  baseTableRef.value?.scrollToTop()
}

const tableLabels: TableLabel[] = [
  { key: 'select', title: '', slot: true, headerSlot: true },
  { key: 'id', title: 'ID' },
  { key: 'takenAt', title: 'Date', slot: true },
  { key: 'source', title: 'Source' },
  { key: 'rawSize', title: 'Raw Size', slot: true },
  { key: 'storedSize', title: 'Stored Size', slot: true },
  { key: 'characters', title: 'Characters', slot: true },
  { key: 'artifacts', title: 'Artifacts', slot: true },
  { key: 'weapons', title: 'Weapons', slot: true },
  { key: 'mora', title: 'Mora', slot: true },
  { key: 'primogem', title: 'Primogems', slot: true },
  { key: 'actions', title: 'Actions', slot: true },
]

const formatKb = (bytes: number) => (bytes ? (bytes / 1024).toFixed(1) + ' KB' : '0 KB')

// ------------------------------------------------------------------- download

const downloading = shallowRef<ReadonlySet<number>>(new Set())

const downloadSnapshot = async (snapshot: SnapshotResponse) => {
  if (downloading.value.has(snapshot.id)) return
  downloading.value = new Set([...downloading.value, snapshot.id])
  try {
    await downloadSnapshotGood(account.value.id, snapshot)
  } catch (cause) {
    feedback.error('Failed to download snapshot', cause)
  } finally {
    const next = new Set(downloading.value)
    next.delete(snapshot.id)
    downloading.value = next
  }
}

/** The running export when it is this account's. */
const job = computed(() =>
  exportJob.value && exportJob.value.accountId === account.value.id ? exportJob.value : null,
)
const hasActiveExport = computed(() => exportJob.value !== null)
const exportTitle = computed(() => {
  const current = job.value
  if (!current) return hasActiveExport.value ? 'Another export is running' : undefined
  if (current.phase === 'fetching') {
    return current.fetchTotal
      ? `Downloading ${formatBytes(current.fetched)} / ${formatBytes(current.fetchTotal)}`
      : `Downloading ${formatBytes(current.fetched)}`
  }
  return `Zipping ${formatNumber(current.done)} / ${formatNumber(current.total)}`
})

function zipFileName(items: readonly SnapshotResponse[]): string {
  const name =
    accounts
      .displayName(account.value)
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `account-${account.value.id}`
  let oldest = Infinity
  let newest = -Infinity
  for (const { takenAt } of items) {
    oldest = Math.min(oldest, takenAt)
    newest = Math.max(newest, takenAt)
  }
  const from = dayKey(oldest)
  const to = dayKey(newest)
  return `GDT_export-${name}-${from === to ? from : `${from}_to_${to}`}.zip`
}

/** Runs from a click: the save picker inside needs the gesture, so nothing awaits first. */
const handleBulkDownload = async () => {
  if (hasActiveExport.value) return
  const ids = new Set(selectedIdList())
  const items = list.value.filter((s) => ids.has(s.id))
  if (items.length === 0) return
  try {
    const result = await exportZip({
      accountId: account.value.id,
      ids: items.length === list.value.length ? null : items.map((s) => s.id),
      requested: items.length,
      fileName: zipFileName(items),
    })
    if (!result) return
    resetSelection()
    const missing = result.requested - result.files
    feedback.toast({
      tone: 'success',
      title: `Saved ${result.fileName}`,
      detail:
        `${formatNumber(result.files)} ${result.files === 1 ? 'file' : 'files'} · ` +
        formatBytes(result.zipBytes) +
        (missing > 0 ? ` · ${formatNumber(missing)} gone` : ''),
    })
  } catch (cause) {
    feedback.error('Export failed', cause)
  }
}

// --------------------------------------------------------------------- delete

const deleting = ref(false)

/** Deletes `ids`, then reloads the account so its data version (and this list) moves. */
async function removeSnapshots(ids: number[], bulk: boolean) {
  const accountId = account.value.id
  deleting.value = true
  let reported = 0
  let failure: unknown = null
  try {
    if (ids.length === 1) {
      await api.deleteSnapshot(accountId, ids[0]!)
      reported = 1
    } else {
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        const batch = ids.slice(i, i + DELETE_BATCH)
        reported += Math.min(batch.length, (await api.deleteSnapshots(accountId, batch)).deleted)
      }
    }
  } catch (cause) {
    failure = cause
  }
  // Always move the data version (a failed batch may follow successful ones),
  // then count from the fresh list: the bulk endpoint's `deleted` overstates.
  let deleted = reported
  try {
    const fresh = await accounts.reload(accountId)
    const live = new Set((await loadSnapshots(fresh)).map((s) => s.id))
    deleted = ids.filter((id) => !live.has(id)).length
  } catch {
    // Keep the server's figure; the list refreshes on the next navigation.
  }
  deleting.value = false

  if (failure) {
    feedback.error(
      deleted > 0
        ? `Deleted ${formatNumber(deleted)} of ${formatNumber(ids.length)} snapshots`
        : bulk
          ? 'Failed to delete snapshots'
          : 'Failed to delete snapshot',
      failure,
    )
    return
  }
  if (bulk) {
    resetSelection()
    page.value = 1
  }
  feedback.toast({
    tone: 'success',
    title: `Successfully deleted ${formatNumber(deleted)} ${deleted === 1 ? 'snapshot' : 'snapshots'}`,
  })
}

const deleteSnapshot = async (snapshot: SnapshotResponse) => {
  if (deleting.value) return
  const confirmed = await confirmDialog.value?.ask({
    title: 'Are you sure?',
    text: 'You are about to delete this snapshot. This cannot be undone.',
    confirmText: 'Yes, delete it!',
  })
  if (!confirmed) return
  await removeSnapshots([snapshot.id], false)
}

const handleBulkDelete = async () => {
  if (deleting.value || selectedCount.value === 0) return

  const confirmed = await confirmDialog.value?.ask({
    title: 'Are you sure?',
    text: `You are about to delete ${selectedCount.value} snapshot(s). This cannot be undone.`,
    confirmText: 'Yes, delete them!',
  })
  if (!confirmed) return

  if (selectAll.value) {
    const doubleConfirmed = await confirmDialog.value?.ask({
      title: 'Mass Deletion Warning',
      text: 'You have selected ALL snapshots across ALL pages. Type "DELETE" to confirm you want to wipe everything.',
      confirmText: 'I understand, DELETE ALL!',
      expect: 'DELETE',
    })
    if (!doubleConfirmed) return
  }

  const ids = selectedIdList()
  if (ids.length === 0) return
  await removeSnapshots(ids, true)
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 min-h-[60vh] relative">
    <div class="space-y-6">
      <StorageStrip
        :snapshots="account.snapshotCount"
        :raw-bytes="account.rawBytes"
        :stored-bytes="account.storedBytes"
        :loading="!snapshots && !error"
      />

      <!-- Sticky Toolbar Overlay (below the 4rem top bar) -->
      <div class="sticky top-16 z-40 w-full h-0">
        <transition name="slide-down">
          <div
            v-if="selectedCount > 0"
            class="absolute w-full flex items-center justify-between gap-2 bg-slate-800 dark:bg-slate-700 rounded-lg p-3 shadow-md z-20 transition-colors"
          >
            <span class="text-sm font-semibold text-white ml-2"
              >{{ selectedCount }} selected out of {{ meta.total }}</span
            >
            <div class="flex items-center gap-3">
              <BaseButton
                variant="secondary"
                size="sm"
                :loading="job !== null"
                :disabled="hasActiveExport"
                :title="exportTitle"
                @click="handleBulkDownload"
              >
                Download
              </BaseButton>
              <BaseButton variant="danger" size="sm" :loading="deleting" @click="handleBulkDelete">
                Delete
              </BaseButton>
            </div>
          </div>
        </transition>
      </div>

      <!-- Normal Flow Heading -->
      <div class="flex items-center justify-between mb-4 h-[3.25rem]">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white transition-colors">
          Import History
        </h2>
      </div>

      <UiError v-if="error && snapshots" :error="error" title="Load failed" @retry="reload" />

      <BaseTable
        ref="baseTableRef"
        class="history-table"
        :labels="tableLabels"
        :data="rows"
        :is-loading="isLoading"
        :meta="meta"
        @page-change="onPageChange"
        @limit-change="onLimitChange"
      >
        <template #header-select>
          <div
            class="flex items-center justify-center cursor-pointer -mx-2.5 -my-4 px-2.5 py-4"
            role="checkbox"
            :aria-checked="selectAll"
            aria-label="Select all snapshots"
            tabindex="0"
            @click="onHeaderToggle"
            @keydown.space.prevent="onHeaderToggle"
          >
            <div
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
              :class="
                selectAll
                  ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent'
              "
            >
              <svg class="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
          </div>
        </template>
        <template #select="{ item }">
          <div
            class="flex items-center justify-center cursor-pointer -mx-2.5 -my-4 px-2.5 py-4"
            role="checkbox"
            :aria-checked="isSelected(item.id)"
            :aria-label="`Select snapshot ${item.id}`"
            tabindex="0"
            @click="toggleSelection(item.id)"
            @keydown.space.prevent="toggleSelection(item.id)"
          >
            <div
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
              :class="
                isSelected(item.id)
                  ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent'
              "
            >
              <svg class="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
          </div>
        </template>
        <template #takenAt="{ item }">
          <span class="font-medium whitespace-nowrap">{{ formatFullDateTime(item.takenAt) }}</span>
        </template>
        <template #rawSize="{ item }">
          <span class="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{{
            formatKb(item.rawSize)
          }}</span>
        </template>
        <template #storedSize="{ item }">
          <span class="text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">{{
            formatKb(item.storedSize)
          }}</span>
        </template>
        <template #characters="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{
            item.summary.characters
          }}</span>
        </template>
        <template #artifacts="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{
            item.summary.artifacts
          }}</span>
        </template>
        <template #weapons="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{
            item.summary.weapons
          }}</span>
        </template>
        <template #mora="{ item }">
          <span
            v-if="currencyMissing(item.summary)"
            class="font-medium text-slate-400 dark:text-slate-500"
            title="No currency in this snapshot"
            >—</span
          >
          <MoraDisplay
            v-else
            :amount="item.summary.mora"
            class="font-medium text-slate-700 dark:text-slate-300"
          />
        </template>
        <template #primogem="{ item }">
          <span
            v-if="currencyMissing(item.summary)"
            class="font-medium text-slate-400 dark:text-slate-500"
            title="No currency in this snapshot"
            >—</span
          >
          <ItemDisplay
            v-else
            :amount="item.summary.primogem"
            image="/img/Item_Primogem.webp"
            name="primogem"
            class="font-medium text-slate-700 dark:text-slate-300"
          />
        </template>
        <template #actions="{ item }">
          <div class="flex items-center gap-2">
            <BaseButton
              size="xs"
              variant="primary"
              :loading="downloading.has(item.id)"
              @click="downloadSnapshot(item)"
              title="Download GOOD"
            >
              <template #icon>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  ></path>
                </svg>
              </template>
              DL
            </BaseButton>
            <BaseButton
              size="xs"
              variant="danger-soft"
              :disabled="deleting"
              @click="deleteSnapshot(item)"
              title="Delete Snapshot"
            >
              <template #icon>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  ></path>
                </svg>
              </template>
              Del
            </BaseButton>
          </div>
        </template>

        <template #empty>
          <div v-if="error" class="py-4 flex justify-center text-left">
            <UiError :error="error" title="Load failed" @retry="reload" />
          </div>
          <div v-else class="py-8">
            <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">
              No Snapshots Found
            </h3>
            <p class="text-slate-500 dark:text-slate-400">
              Import your first GOOD JSON file to see your snapshots here.
            </p>
          </div>
        </template>
      </BaseTable>
    </div>

    <ConfirmDialog ref="confirmDialog" />
  </div>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/*
 * Twelve columns (Mora and Primogems replace the old Achievements) do not fit
 * the page with BaseTable's p-4 cells; narrower side padding lets the table
 * fit from a 1440px-wide window instead of hiding Actions behind a scroll.
 */
.history-table :deep(th),
.history-table :deep(td) {
  padding-left: 0.625rem;
  padding-right: 0.625rem;
}
</style>
