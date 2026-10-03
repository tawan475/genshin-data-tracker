<script setup lang="ts">
import { MAX_IMPORT_FILES } from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Pause, Play, RotateCcw, Upload } from 'lucide-vue-next'
import GoodDropZone from '@/components/import/GoodDropZone.vue'
import ImportKeyPanel from '@/components/import/ImportKeyPanel.vue'
import ImportQueueTable from '@/components/import/ImportQueueTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import type { CollectedFiles } from '@/data/import-files'
import {
  addFiles,
  cancel,
  clearAll,
  clearFinished,
  pause,
  removeItem,
  retryFailed,
  start,
  summarize,
  useImportQueue,
} from '@/data/import-queue'
import { formatBytes, formatNumber } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

const account = useAccount()
const feedback = useFeedback()

// The queue outlives this screen: an upload keeps going while the user browses.
const queue = computed(() => useImportQueue(account.value.id))
const summary = computed(() => summarize(queue.value))
const state = computed(() => queue.value.state)
const busy = computed(
  () => state.value === 'running' || state.value === 'pausing' || state.value === 'cancelling',
)

const ready = computed(() =>
  queue.value.items.filter((item) => item.status === 'queued' || item.status === 'cancelled'),
)
const readyBytes = computed(() => ready.value.reduce((sum, item) => sum + item.size, 0))
const retryable = computed(
  () => queue.value.items.filter((item) => item.status === 'failed' && item.retryable).length,
)
const hasFinished = computed(() =>
  queue.value.items.some((item) => item.status === 'created' || item.status === 'unchanged'),
)
const run = computed(() => queue.value.run)

// A one-second clock, only while the queue is waiting (rate limit or retry).
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
watch(
  () => queue.value.waitUntil,
  (until) => {
    clearInterval(ticker)
    if (!until) return
    now.value = Date.now()
    ticker = setInterval(() => (now.value = Date.now()), 1000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(ticker))
const waitSeconds = computed(() =>
  queue.value.waitUntil ? Math.max(0, Math.ceil((queue.value.waitUntil - now.value) / 1000)) : 0,
)

const n = (value: number) => formatNumber(value)

/** The queue in numbers: "12/185 · 4.1 MB · 3 unchanged · 1 failed". */
const statusLine = computed(() => {
  const s = summary.value
  const counts = [formatBytes(s.sentBytes)]
  if (s.unchanged) counts.push(`${n(s.unchanged)} unchanged`)
  if (s.failed) counts.push(`${n(s.failed)} failed`)
  const position = `${n(Math.min(s.done + (s.current ? 1 : 0), s.total))}/${n(s.total)}`
  switch (state.value) {
    case 'running':
      return queue.value.waitUntil
        ? [position, ...counts, `wait ${waitSeconds.value} s`]
        : [position, ...counts]
    case 'pausing':
      return ['Pausing', position]
    case 'cancelling':
      return ['Cancelling', position]
    case 'paused':
      return ['Paused', `${n(s.done)}/${n(s.total)}`, ...counts]
  }
  if (run.value?.outcome === 'cancelled') {
    return ['Cancelled', `${n(s.created + s.unchanged)}/${n(s.total)}`]
  }
  if (run.value?.outcome === 'done' && ready.value.length === 0) {
    const done = ['Done', `${n(s.created)} new`]
    if (s.unchanged) done.push(`${n(s.unchanged)} unchanged`)
    if (s.failed) done.push(`${n(s.failed)} failed`)
    return [...done, formatBytes(s.sentBytes)]
  }
  if (ready.value.length > 0) {
    const files = [`${n(ready.value.length)} files`, formatBytes(readyBytes.value)]
    return queue.value.reading > 0 ? [...files, `reading ${n(queue.value.reading)}`] : files
  }
  return [`${n(queue.value.items.length)} files`]
})

function onFiles(collected: CollectedFiles) {
  const report = addFiles(queue.value, collected.files)
  const notes: string[] = []
  if (collected.ignored) notes.push(`${n(collected.ignored)} not .json`)
  if (report.duplicates) notes.push(`${n(report.duplicates)} already listed`)
  if (report.overLimit) notes.push(`${n(report.overLimit)} over the ${MAX_IMPORT_FILES} limit`)
  if (notes.length === 0) return
  feedback.toast({
    tone: report.added > 0 ? 'info' : 'danger',
    title: `Added ${n(report.added)}`,
    detail: `Skipped: ${notes.join(' · ')}`,
  })
}
</script>

<template>
  <PageHeader title="Import" />

  <!-- Mobile: drop zone, queue, Irminsul. Wide: drop zone and Irminsul side by side, queue below. -->
  <div class="grid gap-6 xl:grid-cols-5">
    <GoodDropZone class="xl:col-span-3" :primary="queue.items.length === 0" @files="onFiles" />

    <div class="order-last min-w-0 xl:order-none xl:col-span-2">
      <ImportKeyPanel class="h-full" :account="account" />
    </div>

    <UiPanel v-if="queue.items.length > 0" class="min-w-0 xl:order-last xl:col-span-5" flush>
      <template #header>
        <div class="min-w-0">
          <h2 class="text-base font-semibold">Queue</h2>
          <p
            class="tabular mt-0.5 font-mono text-sm text-text-secondary"
            :title="queue.waitReason ?? undefined"
          >
            {{ statusLine.join(' · ') }}
          </p>
        </div>
      </template>
      <template #actions>
        <template v-if="busy">
          <UiButton v-if="state === 'running'" @click="pause(queue)">
            <Pause class="size-4" aria-hidden="true" />
            Pause
          </UiButton>
          <UiButton v-else disabled>
            <UiSpinner class="size-4" />
            {{ state === 'pausing' ? 'Pausing' : 'Cancelling' }}
          </UiButton>
          <UiButton v-if="state !== 'cancelling'" variant="ghost" @click="cancel(queue)">
            Cancel
          </UiButton>
        </template>
        <template v-else-if="state === 'paused'">
          <UiButton variant="primary" @click="start(queue)">
            <Play class="size-4" aria-hidden="true" />
            Resume
          </UiButton>
          <UiButton variant="ghost" @click="cancel(queue)">Cancel</UiButton>
        </template>
        <template v-else>
          <UiButton v-if="ready.length > 0" variant="primary" @click="start(queue)">
            <Upload class="size-4" aria-hidden="true" />
            Upload {{ n(ready.length) }}
          </UiButton>
          <UiButton
            v-if="retryable > 0"
            :title="`Retry ${n(retryable)} failed`"
            @click="retryFailed(queue)"
          >
            <RotateCcw class="size-4" aria-hidden="true" />
            Retry
          </UiButton>
          <UiButton
            v-if="run && summary.created + summary.unchanged > 0"
            :to="{ name: 'account-snapshots', params: { accountId: account.id } }"
          >
            Snapshots
          </UiButton>
          <UiButton
            variant="ghost"
            :title="hasFinished ? 'Remove uploaded files' : 'Remove all'"
            @click="hasFinished ? clearFinished(queue) : clearAll(queue)"
          >
            Clear
          </UiButton>
        </template>
      </template>

      <div v-if="run" class="border-b border-border-subtle px-5 py-3">
        <UiProgress
          :value="summary.done"
          :max="summary.total"
          :label="`Uploaded ${summary.done} of ${summary.total}`"
        />
      </div>

      <ImportQueueTable :items="queue.items" :busy="busy" @remove="(id) => removeItem(queue, id)" />
    </UiPanel>
  </div>
</template>
