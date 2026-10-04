<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import type { ExportJob } from '@/data/export'
import { formatBytes, formatNumber } from '@/lib/format'

/**
 * The old sticky selection toolbar. It overlays the "Import History" heading
 * (below the 4rem top bar) while rows are selected or a zip export of this
 * account runs, and shows that export's progress.
 */
const props = defineProps<{
  selected: number
  total: number
  /** Selected snapshots the date filter hides. */
  hidden: number
  /** This account's running export. */
  job: Readonly<ExportJob> | null
  /** Another account's export is running; only one runs at a time. */
  blocked: boolean
  deleting: boolean
}>()
const emit = defineEmits<{ download: []; delete: []; clear: []; cancel: [] }>()

const progress = computed(() => {
  const job = props.job
  if (!job) return null
  if (job.phase === 'saving') return 'Saving…'
  if (job.phase === 'fetching') {
    return job.fetchTotal
      ? `Downloading ${formatBytes(job.fetched)} / ${formatBytes(job.fetchTotal)}`
      : `Downloading ${formatBytes(job.fetched)}`
  }
  return `Zipping ${formatNumber(job.done)} / ${formatNumber(job.total)}`
})
</script>

<template>
  <div class="sticky top-16 z-40 w-full h-0">
    <transition name="slide-down">
      <div
        v-if="selected > 0 || job"
        class="absolute w-full h-[3.25rem] flex items-center justify-between gap-2 bg-slate-800 dark:bg-slate-700 rounded-lg px-2.5 shadow-md z-20 transition-colors"
      >
        <div v-if="job" class="flex min-w-0 items-center gap-2 ml-2" role="status">
          <span
            class="size-4 shrink-0 rounded-full border-2 border-slate-500 border-t-white animate-spin"
            aria-hidden="true"
          />
          <span class="truncate text-sm font-semibold text-white" :title="job.fileName">
            {{ progress }}
          </span>
        </div>
        <div v-else class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Clear selection"
            title="Clear selection"
            :disabled="deleting"
            @click="emit('clear')"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
          <span class="truncate text-sm font-semibold text-white" role="status">
            {{ selected }} selected<span class="hidden sm:inline"> out of {{ total }}</span>
            <span
              v-if="hidden > 0"
              class="font-normal text-slate-300"
              :title="`${hidden} selected snapshots are outside the dates`"
            >
              · {{ hidden }} hidden</span
            >
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <BaseButton
            v-if="job"
            variant="secondary"
            size="sm"
            :disabled="job.phase === 'saving'"
            @click="emit('cancel')"
          >
            Cancel
          </BaseButton>
          <template v-else>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="blocked || deleting"
              :title="blocked ? 'Another export is running' : 'Download a zip of GOOD files'"
              @click="emit('download')"
            >
              Download
            </BaseButton>
            <BaseButton variant="danger" size="sm" :loading="deleting" @click="emit('delete')">
              Delete
            </BaseButton>
          </template>
        </div>
      </div>
    </transition>
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
</style>
