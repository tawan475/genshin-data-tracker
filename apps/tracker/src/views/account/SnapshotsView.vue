<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { useElementSize } from '@vueuse/core'
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { Download, Repeat2, Trash2 } from 'lucide-vue-next'
import { api } from '@/api'
import BaseButton from '@/components/legacy/BaseButton.vue'
import BasePagination, { type PaginationMeta } from '@/components/legacy/BasePagination.vue'
import BaseTable, { type TableLabel } from '@/components/legacy/BaseTable.vue'
import ConfirmDialog from '@/components/snapshot-history/ConfirmDialog.vue'
import ExportTargets from '@/components/snapshot-history/ExportTargets.vue'
import FigureCell from '@/components/snapshot-history/FigureCell.vue'
import LegacyCheckbox from '@/components/snapshot-history/LegacyCheckbox.vue'
import RangeFilter from '@/components/snapshot-history/RangeFilter.vue'
import SelectionBar from '@/components/snapshot-history/SelectionBar.vue'
import SnapshotCards from '@/components/snapshot-history/SnapshotCards.vue'
import StorageStrip from '@/components/snapshot-history/StorageStrip.vue'
import { inDayRange, snapshotChanges } from '@/components/snapshot-history/snapshot-figures'
import UiError from '@/components/ui/UiError.vue'
import { useSnapshotSelection } from '@/composables/useSnapshotSelection'
import { loadSnapshots } from '@/data/account-data'
import { cancelExport, downloadSnapshotGood, exportJob, exportZip } from '@/data/export'
import { currencyMissing, dayKey } from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatFullDateTime, formatNumber } from '@/lib/format'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/** The bulk delete endpoint takes at most this many ids per request. */
const DELETE_BATCH = 1000
/** Content widths (px) that fit every column, and every column but Source and Raw Size. */
const FULL_TABLE = 1100
const COMPACT_TABLE = 940
const PER_PAGE_KEY = 'snapshot-history:per-page'

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

/** Every snapshot, newest first. */
const list = computed<readonly SnapshotResponse[]>(() => snapshots.value ?? [])
const changes = computed(() => snapshotChanges(list.value))

// ----------------------------------------------------------------- date filter

const from = ref('')
const to = ref('')
const filtering = computed(() => from.value !== '' || to.value !== '')
const filtered = computed(() => inDayRange(list.value, from.value, to.value))
const firstDay = computed(() => {
  const oldest = list.value[list.value.length - 1]
  return oldest ? dayKey(oldest.takenAt) : ''
})
const lastDay = computed(() => (list.value[0] ? dayKey(list.value[0].takenAt) : ''))

// ------------------------------------------------------------------ pagination

const page = ref(1)
const storedLimit = Number(readStorage(PER_PAGE_KEY))
const limit = ref([10, 20, 24, 50, 100].includes(storedLimit) ? storedLimit : 20)

const meta = computed<PaginationMeta>(() => {
  const total = filtered.value.length
  const totalPages = Math.max(1, Math.ceil(total / limit.value))
  return { page: Math.min(page.value, totalPages), limit: limit.value, totalPages, total }
})
const rows = computed(() => {
  const start = (meta.value.page - 1) * meta.value.limit
  return filtered.value.slice(start, start + meta.value.limit)
})

watch([from, to], () => (page.value = 1))

function clearDates() {
  from.value = ''
  to.value = ''
}

const baseTableRef = ref<InstanceType<typeof BaseTable> | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const onPageChange = (p: number) => {
  page.value = p
}

const onLimitChange = (l: number) => {
  limit.value = l
  page.value = 1
  writeStorage(PER_PAGE_KEY, String(l))
  baseTableRef.value?.scrollToTop()
}

// --------------------------------------------------------------------- layout

/** The table where its columns fit, cards below that (phones, tablets). */
const host = useTemplateRef<HTMLElement>('host')
const { width } = useElementSize(
  host,
  {
    // A first guess from the window (minus the sidebar and gutters) so wide
    // screens don't flash the cards before the observer reports.
    width: Math.min(
      1152,
      window.innerWidth -
        (window.innerWidth >= 1024 ? 256 : 0) -
        (window.innerWidth >= 640 ? 64 : 32),
    ),
    height: 0,
  },
  { box: 'border-box' },
)
const layout = computed(() =>
  width.value >= FULL_TABLE ? 'full' : width.value >= COMPACT_TABLE ? 'compact' : 'cards',
)

const tableLabels = computed<TableLabel[]>(() => [
  { key: 'select', title: '', slot: true, headerSlot: true },
  { key: 'id', title: 'ID' },
  { key: 'takenAt', title: 'Date', slot: true },
  ...(layout.value === 'full'
    ? [
        { key: 'source', title: 'Source' },
        { key: 'rawSize', title: 'Raw Size', slot: true },
      ]
    : []),
  { key: 'storedSize', title: 'Stored Size', slot: true },
  { key: 'characters', title: 'Characters', slot: true },
  { key: 'artifacts', title: 'Artifacts', slot: true },
  { key: 'weapons', title: 'Weapons', slot: true },
  { key: 'mora', title: 'Mora', slot: true },
  { key: 'primogem', title: 'Primogems', slot: true },
  { key: 'actions', title: 'Actions', slot: true },
])

const formatKb = (bytes: number) => (bytes ? (bytes / 1024).toFixed(1) + ' KB' : '0 KB')

// ------------------------------------------------------------------ selection

const {
  selectedCount,
  allSelected,
  isSelected,
  toggle,
  coverage,
  toggleView,
  selectOnly,
  selectedIdList,
  retain,
  resetSelection,
} = useSnapshotSelection(list)

const viewCoverage = computed(() => coverage(filtered.value))
/** Selected snapshots outside the date filter. */
const hiddenSelected = computed(() => {
  if (!filtering.value) return 0
  let shown = 0
  for (const { id } of filtered.value) if (isSelected(id)) shown++
  return selectedCount.value - shown
})

const onToggle = (id: number, event: MouseEvent | KeyboardEvent) =>
  toggle(id, filtered.value, event.shiftKey)
const onToggleAll = () => toggleView(filtered.value)
const selectRange = () => selectOnly(filtered.value)

// The view is reused when switching accounts: start over.
watch(
  () => account.value.id,
  () => {
    page.value = 1
    from.value = ''
    to.value = ''
    resetSelection()
  },
)

// Snapshots deleted here or elsewhere leave the selection.
watch(list, (live) => retain(new Set(live.map((s) => s.id))))

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
const exportBlocked = computed(() => exportJob.value !== null && job.value === null)

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
  if (exportJob.value) return
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

  if (allSelected.value) {
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
  <div class="max-w-6xl mx-auto space-y-6 min-h-[60vh] relative">
    <ExportTargets :account="account" />

    <StorageStrip
      :snapshots="account.snapshotCount"
      :raw-bytes="account.rawBytes"
      :stored-bytes="account.storedBytes"
      :loading="!snapshots && !error"
    />

    <div ref="host" class="space-y-3">
      <!-- Sticks within this block (the whole table), so not wrapped with the heading. -->
      <SelectionBar
        class="mb-0"
        :selected="selectedCount"
        :total="list.length"
        :hidden="hiddenSelected"
        :job="job"
        :blocked="exportBlocked"
        :deleting="deleting"
        @download="handleBulkDownload"
        @delete="handleBulkDelete"
        @clear="resetSelection"
        @cancel="cancelExport"
      />

      <!-- Normal Flow Heading; the selection toolbar covers it. -->
      <h2
        class="flex h-[3.25rem] items-center text-xl font-bold text-slate-900 dark:text-white transition-colors"
      >
        Import History
      </h2>

      <RangeFilter
        v-if="list.length > 0"
        v-model:from="from"
        v-model:to="to"
        :first-day="firstDay"
        :last-day="lastDay"
        :matched="filtered.length"
        @select="selectRange"
      />

      <UiError v-if="error && snapshots" :error="error" title="Load failed" @retry="reload" />

      <template v-if="layout === 'cards'">
        <div
          v-if="isLoading && rows.length === 0"
          class="flex justify-center rounded-xl border border-slate-200 bg-white p-12 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <span
            class="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin"
          />
        </div>
        <template v-else>
          <SnapshotCards
            :rows="rows"
            :changes="changes"
            :is-selected="isSelected"
            :coverage="viewCoverage"
            :downloading="downloading"
            :deleting="deleting"
            :format-kb="formatKb"
            @toggle="onToggle"
            @toggle-all="onToggleAll"
            @download="downloadSnapshot"
            @delete="deleteSnapshot"
          >
            <template #empty>
              <div v-if="error" class="flex justify-center text-left">
                <UiError :error="error" title="Load failed" @retry="reload" />
              </div>
              <div v-else-if="filtering" class="flex flex-col items-center gap-3">
                <p class="font-medium text-slate-700 dark:text-slate-200">No snapshots in range</p>
                <BaseButton variant="outline" size="sm" @click="clearDates">Clear dates</BaseButton>
              </div>
              <div v-else class="flex flex-col items-center gap-3">
                <p class="font-medium text-slate-700 dark:text-slate-200">No snapshots</p>
                <RouterLink
                  :to="{ name: 'account-import', params: { accountId: account.id } }"
                  class="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >Import</RouterLink
                >
              </div>
            </template>
          </SnapshotCards>
          <BasePagination
            v-if="rows.length > 0"
            :meta="meta"
            :is-loading="isLoading"
            :scroll-anchor="host"
            @page-change="onPageChange"
            @limit-change="onLimitChange"
          />
        </template>
      </template>

      <BaseTable
        v-else
        ref="baseTableRef"
        class="history-table"
        :labels="tableLabels"
        :data="rows"
        :row-class="
          (row) => (isSelected(row.id) ? 'bg-indigo-50/70 dark:bg-indigo-500/10' : undefined)
        "
        :is-loading="isLoading"
        :meta="meta"
        @page-change="onPageChange"
        @limit-change="onLimitChange"
      >
        <template #header-select>
          <LegacyCheckbox
            class="-mx-2.5 -my-4 px-2.5 py-4"
            :checked="viewCoverage === 'all'"
            :mixed="viewCoverage === 'some'"
            :label="filtering ? 'Select all in range' : 'Select all snapshots'"
            @toggle="onToggleAll"
          />
        </template>
        <template #select="{ item }">
          <LegacyCheckbox
            class="-mx-2.5 -my-4 px-2.5 py-4"
            :checked="isSelected(item.id)"
            :label="`Select snapshot ${item.id}`"
            title="Shift-click to select a range"
            @toggle="(event) => onToggle(item.id, event)"
          />
        </template>
        <template #takenAt="{ item }">
          <span class="inline-flex items-center gap-1.5 font-medium whitespace-nowrap">
            {{ formatFullDateTime(item.takenAt) }}
            <span
              v-if="item.lastSeenAt > item.takenAt"
              class="text-slate-400 dark:text-slate-500"
              :title="`Unchanged until ${formatFullDateTime(item.lastSeenAt)}`"
            >
              <Repeat2 class="size-3.5" aria-hidden="true" />
              <span class="sr-only">Unchanged until {{ formatFullDateTime(item.lastSeenAt) }}</span>
            </span>
          </span>
        </template>
        <template #rawSize="{ item }">
          <span class="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{{
            formatKb(item.rawSize)
          }}</span>
        </template>
        <template #storedSize="{ item }">
          <span
            class="text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap"
            :title="`${item.source} · ${formatKb(item.rawSize)} → ${formatKb(item.storedSize)}`"
            >{{ formatKb(item.storedSize) }}</span
          >
        </template>
        <template #characters="{ item }">
          <FigureCell
            class="-my-1.5"
            :value="item.summary.characters"
            :change="changes.get(item.id)?.characters"
          />
        </template>
        <template #artifacts="{ item }">
          <FigureCell
            class="-my-1.5"
            :value="item.summary.artifacts"
            :change="changes.get(item.id)?.artifacts"
          />
        </template>
        <template #weapons="{ item }">
          <FigureCell
            class="-my-1.5"
            :value="item.summary.weapons"
            :change="changes.get(item.id)?.weapons"
          />
        </template>
        <template #mora="{ item }">
          <FigureCell
            class="-my-1.5"
            kind="mora"
            :value="item.summary.mora"
            :change="changes.get(item.id)?.mora"
            :missing="currencyMissing(item.summary)"
          />
        </template>
        <template #primogem="{ item }">
          <FigureCell
            class="-my-1.5"
            kind="primogem"
            :value="item.summary.primogem"
            :change="changes.get(item.id)?.primogem"
            :missing="currencyMissing(item.summary)"
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
                <Download class="w-3.5 h-3.5" aria-hidden="true" />
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
                <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
              </template>
              Del
            </BaseButton>
          </div>
        </template>

        <template #empty>
          <div v-if="error" class="py-4 flex justify-center text-left">
            <UiError :error="error" title="Load failed" @retry="reload" />
          </div>
          <div v-else-if="filtering" class="py-8 flex flex-col items-center gap-3">
            <p class="text-lg font-bold text-slate-700 dark:text-slate-200">
              No snapshots in range
            </p>
            <BaseButton variant="outline" size="sm" @click="clearDates">Clear dates</BaseButton>
          </div>
          <div v-else class="py-8 flex flex-col items-center gap-3">
            <p class="text-lg font-bold text-slate-700 dark:text-slate-200">No snapshots</p>
            <RouterLink
              :to="{ name: 'account-import', params: { accountId: account.id } }"
              class="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              >Import</RouterLink
            >
          </div>
        </template>
      </BaseTable>
    </div>

    <ConfirmDialog ref="confirmDialog" />
  </div>
</template>

<style scoped>
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
