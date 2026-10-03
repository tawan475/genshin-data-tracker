<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, ref, shallowRef, watch } from 'vue'
import { FileArchive, History, Upload } from 'lucide-vue-next'
import { api } from '@/api'
import SnapshotActionBar from '@/components/snapshots/SnapshotActionBar.vue'
import SnapshotDayGroup from '@/components/snapshots/SnapshotDayGroup.vue'
import SnapshotListSkeleton from '@/components/snapshots/SnapshotListSkeleton.vue'
import SnapshotSelectTools from '@/components/snapshots/SnapshotSelectTools.vue'
import SnapshotStats from '@/components/snapshots/SnapshotStats.vue'
import { dayKey, groupByDay, indexByDay } from '@/components/snapshots/days'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { loadSnapshots } from '@/data/account-data'
import { cancelExport, downloadSnapshotGood, exportJob, exportZip } from '@/data/export'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatNumber } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/** Rows rendered per "Show older" step; accounts can hold thousands of snapshots. */
const PAGE = 100
/** The bulk delete endpoint takes at most this many ids per request. */
const DELETE_BATCH = 1000

const account = useAccount()
const accounts = useAccounts()
const feedback = useFeedback()

const {
  data: snapshots,
  error,
  loading,
  reload,
} = useResource(
  () => account.value,
  (value) => loadSnapshots(value),
)

const limit = ref(PAGE)
const selected = shallowRef<ReadonlySet<number>>(new Set())
const downloading = shallowRef<ReadonlySet<number>>(new Set())
const deleting = ref(false)

// The view is reused when switching accounts: start over.
watch(
  () => account.value.id,
  () => {
    limit.value = PAGE
    selected.value = new Set()
  },
)

const list = computed<readonly SnapshotResponse[]>(() => snapshots.value ?? [])
/** Loaded, and there is nothing to show. */
const isEmpty = computed(() => snapshots.value !== undefined && snapshots.value.length === 0)
const byId = computed(() => new Map(list.value.map((s) => [s.id, s])))
const idsByDay = computed(() => indexByDay(list.value))
const groups = computed(() => groupByDay(list.value, limit.value, idsByDay.value))
const shownIds = computed(() => list.value.slice(0, limit.value).map((s) => s.id))
const shownSelected = computed(() => shownIds.value.filter((id) => selected.value.has(id)).length)
const remaining = computed(() => Math.max(0, list.value.length - limit.value))
const firstDay = computed(() => (list.value.length ? dayKey(list.value.at(-1)!.takenAt) : ''))
const lastDay = computed(() => (list.value.length ? dayKey(list.value[0]!.takenAt) : ''))

// Snapshots deleted here or elsewhere leave the selection.
watch(byId, (live) => {
  if (selected.value.size === 0) return
  const kept = [...selected.value].filter((id) => live.has(id))
  if (kept.length !== selected.value.size) selected.value = new Set(kept)
})

// ------------------------------------------------------------------ selection

function toggle(id: number) {
  const next = new Set(selected.value)
  if (!next.delete(id)) next.add(id)
  selected.value = next
}

function selectMany(ids: readonly number[], select: boolean) {
  const next = new Set(selected.value)
  for (const id of ids) {
    if (select) next.add(id)
    else next.delete(id)
  }
  selected.value = next
}

function selectRange(from: string, to: string): number {
  const ids = list.value
    .filter((s) => {
      const key = dayKey(s.takenAt)
      return key >= from && key <= to
    })
    .map((s) => s.id)
  selected.value = new Set(ids)
  return ids.length
}

function clearSelection() {
  selected.value = new Set()
}

function selectedSnapshots(): SnapshotResponse[] {
  return list.value.filter((s) => selected.value.has(s.id))
}

// --------------------------------------------------------------------- export

const job = computed(() =>
  exportJob.value && exportJob.value.accountId === account.value.id ? exportJob.value : null,
)
const exporting = computed(() => exportJob.value !== null)
const blocked = computed(() => exporting.value && exportJob.value!.accountId !== account.value.id)

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
async function runExport(items: readonly SnapshotResponse[]) {
  if (items.length === 0) return
  const all = items.length === list.value.length
  try {
    const result = await exportZip({
      accountId: account.value.id,
      ids: all ? null : items.map((s) => s.id),
      requested: items.length,
      fileName: zipFileName(items),
    })
    if (!result) return
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

function exportSelected() {
  void runExport(selectedSnapshots())
}

function exportAll() {
  void runExport(list.value)
}

async function download(snapshot: SnapshotResponse) {
  if (downloading.value.has(snapshot.id)) return
  downloading.value = new Set([...downloading.value, snapshot.id])
  try {
    await downloadSnapshotGood(account.value.id, snapshot)
  } catch (cause) {
    feedback.error('Download failed', cause)
  } finally {
    const next = new Set(downloading.value)
    next.delete(snapshot.id)
    downloading.value = next
  }
}

// --------------------------------------------------------------------- delete

function deleteCopy(items: readonly SnapshotResponse[]) {
  const n = items.length
  const count = formatNumber(n)
  if (n === list.value.length) {
    return {
      title: n === 1 ? 'Delete the only snapshot?' : `Delete all ${count} snapshots?`,
      detail: 'The account and its import key stay.',
    }
  }
  return {
    title: n === 1 ? 'Delete snapshot?' : `Delete ${count} snapshots?`,
    detail: 'Shared data is kept for other snapshots.',
  }
}

async function remove(items: readonly SnapshotResponse[]) {
  if (items.length === 0 || deleting.value) return
  const ok = await feedback.confirm({
    ...deleteCopy(items),
    confirmLabel: 'Delete',
    tone: 'danger',
  })
  if (!ok) return

  const accountId = account.value.id
  const ids = items.map((s) => s.id)
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
  // then count from the fresh list: the bulk endpoint's `deleted` also counts
  // rows its triggers touch, so it overstates.
  let deleted = reported
  try {
    const fresh = await accounts.reload(accountId)
    const live = new Set((await loadSnapshots(fresh)).map((s) => s.id))
    deleted = ids.filter((id) => !live.has(id)).length
  } catch {
    // Keep the server's figure; the list refreshes on the next navigation.
  }
  selectMany(ids, false)
  deleting.value = false

  if (failure) {
    feedback.error(
      deleted > 0
        ? `Deleted ${formatNumber(deleted)} of ${formatNumber(ids.length)}`
        : 'Delete failed',
      failure,
    )
    return
  }
  feedback.toast({
    tone: 'success',
    title: `Deleted ${formatNumber(deleted)} ${deleted === 1 ? 'snapshot' : 'snapshots'}`,
    detail: deleted < ids.length ? `${formatNumber(ids.length - deleted)} already gone` : undefined,
  })
}
</script>

<template>
  <PageHeader title="Snapshots">
    <template v-if="!isEmpty" #actions>
      <UiButton
        :variant="selected.size > 0 ? 'secondary' : 'primary'"
        :disabled="list.length === 0 || exporting || deleting"
        @click="exportAll"
      >
        <FileArchive class="size-4" aria-hidden="true" />
        Export all
      </UiButton>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-6">
    <SnapshotStats
      v-if="!isEmpty"
      :account="account"
      :snapshots="snapshots"
      :capture-days="idsByDay.size"
      :loading="loading"
    />

    <div>
      <UiPanel flush :aria-busy="loading || undefined" aria-label="Snapshot list">
        <div v-if="error" class="p-3">
          <UiError :error="error" title="Load failed" @retry="reload" />
        </div>

        <SnapshotListSkeleton v-if="!snapshots && !error" />

        <UiEmpty v-else-if="isEmpty" title="No snapshots">
          <template #icon><History aria-hidden="true" /></template>
          <UiButton
            variant="primary"
            :to="{ name: 'account-import', params: { accountId: account.id } }"
          >
            <Upload class="size-4" aria-hidden="true" />
            Import
          </UiButton>
        </UiEmpty>

        <template v-else-if="snapshots">
          <SnapshotSelectTools
            :shown="shownIds.length"
            :shown-selected="shownSelected"
            :first-day="firstDay"
            :last-day="lastDay"
            :select-range="selectRange"
            @select-shown="(select) => selectMany(shownIds, select)"
          />
          <SnapshotDayGroup
            v-for="group in groups"
            :key="group.key"
            :group="group"
            :selected="selected"
            :downloading="downloading"
            @toggle="toggle"
            @select-day="selectMany"
            @download="download"
            @delete="(snapshot) => remove([snapshot])"
          />
          <footer
            class="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4"
          >
            <p
              class="tabular font-mono text-sm text-text-secondary"
              :title="`Showing ${formatNumber(shownIds.length)} of ${formatNumber(list.length)}`"
            >
              {{ formatNumber(shownIds.length) }} / {{ formatNumber(list.length) }}
            </p>
            <UiButton
              v-if="remaining > 0"
              :title="`Show ${formatNumber(Math.min(PAGE, remaining))} more`"
              @click="limit += PAGE"
            >
              Show older
            </UiButton>
          </footer>
        </template>
      </UiPanel>

      <SnapshotActionBar
        v-if="job || selected.size > 0"
        :selected="selected.size"
        :hidden="selected.size - shownSelected"
        :job="job"
        :blocked="blocked"
        :deleting="deleting"
        @export="exportSelected"
        @delete="remove(selectedSnapshots())"
        @clear="clearSelection"
        @cancel="cancelExport"
      />
    </div>
  </div>
</template>
