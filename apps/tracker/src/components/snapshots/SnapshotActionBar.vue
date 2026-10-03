<script setup lang="ts">
import { computed } from 'vue'
import { FileArchive, Trash2, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import type { ExportJob } from '@/data/export'
import { formatBytes, formatNumber } from '@/lib/format'

/**
 * Floats at the bottom of the list while something is selected or an export
 * runs. Controls sit on the left from sm up: toasts appear bottom-right.
 */
const props = defineProps<{
  selected: number
  /** Selected snapshots that are not on screen. */
  hidden: number
  job: Readonly<ExportJob> | null
  /** Another account's export is running; only one runs at a time. */
  blocked: boolean
  deleting: boolean
}>()
const emit = defineEmits<{ export: []; delete: []; clear: []; cancel: [] }>()

const progress = computed(() => {
  const job = props.job
  if (!job) return null
  if (job.phase === 'fetching') {
    const total = job.fetchTotal
    return {
      value: total ? job.fetched : 0,
      max: total ?? 1,
      text: total
        ? `${formatBytes(job.fetched)} / ${formatBytes(total)}`
        : formatBytes(job.fetched),
      title: 'Downloading stored data',
    }
  }
  return {
    value: job.done,
    max: job.total,
    text: `${formatNumber(job.done)}/${formatNumber(job.total)} · ${formatBytes(job.zipBytes)}`,
    title: `${formatNumber(job.done)} of ${formatNumber(job.total)} decoded; ${formatBytes(job.jsonBytes)} of GOOD JSON zipped to ${formatBytes(job.zipBytes)}`,
  }
})
</script>

<template>
  <!-- Clears the mobile tab bar (5rem plus the safe area, as in AppShell). -->
  <div
    class="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-4 rounded-2xl border border-border-default bg-surface-raised p-3 shadow-overlay lg:bottom-6"
  >
    <div v-if="job && progress" class="flex flex-col gap-2">
      <div class="flex items-center gap-3">
        <p
          class="min-w-0 flex-1 truncate font-mono text-sm sm:max-w-md sm:flex-none"
          :title="job.fileName"
        >
          {{ job.fileName }}
        </p>
        <UiButton :disabled="job.phase === 'saving'" @click="emit('cancel')">
          <X class="size-4" aria-hidden="true" />
          Cancel
        </UiButton>
      </div>
      <UiProgress :value="progress.value" :max="progress.max" label="Export progress" />
      <p class="tabular font-mono text-sm text-text-secondary" :title="progress.title">
        {{ progress.text }}
      </p>
    </div>

    <div v-else class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p class="min-w-0 flex-1 sm:flex-none" role="status">
        <span class="tabular font-mono font-medium">{{ formatNumber(selected) }}</span>
        selected
        <span
          v-if="hidden > 0"
          class="text-sm text-text-muted"
          :title="`${formatNumber(hidden)} selected snapshots are not on screen`"
        >
          · <span class="tabular font-mono">{{ formatNumber(hidden) }}</span> hidden
        </span>
      </p>
      <!-- Phones: count and Clear on one line, the two actions full width below. -->
      <UiButton variant="ghost" class="sm:order-last" :disabled="deleting" @click="emit('clear')">
        Clear
      </UiButton>
      <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <UiButton variant="primary" :disabled="blocked || deleting" @click="emit('export')">
          <FileArchive class="size-4" aria-hidden="true" />
          Export
        </UiButton>
        <UiButton :loading="deleting" @click="emit('delete')">
          <Trash2 v-if="!deleting" class="size-4" aria-hidden="true" />
          Delete
        </UiButton>
      </div>
      <p v-if="blocked" class="order-last basis-full text-sm text-text-muted">
        Another export is running
      </p>
    </div>
  </div>
</template>
