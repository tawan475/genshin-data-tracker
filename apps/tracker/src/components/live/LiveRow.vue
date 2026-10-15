<script setup lang="ts">
import type { LiveJournalResponse } from '@gdt/shared'
import { computed } from 'vue'
import { t } from '@/i18n'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '@/lib/format'

/**
 * The Snapshots list's first row while a live journal is open: "● Live —
 * updated 1 min ago", what it holds since the newest snapshot, and (owner
 * only) a button that deletes it.
 */
const props = defineProps<{
  live: LiveJournalResponse | null | undefined
  newestId: number | undefined
  now: number
  deletable?: boolean
  deleting?: boolean
}>()
const emit = defineEmits<{ delete: [] }>()

const shown = computed(() => {
  const live = props.live
  if (!live?.open || !live.changes?.length || live.base?.snapshotId !== props.newestId) return null
  const at = live.updatedAt ?? 0
  return {
    iso: new Date(at).toISOString(),
    ago: formatRelative(at, props.now),
    title: t('live.updatedAt', { time: formatDateTime(at) }),
    changes: live.changes.length,
    bytes: live.bytes ?? 0,
  }
})
</script>

<template>
  <div
    v-if="shown"
    class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-default bg-surface-raised px-4 py-2.5 text-sm shadow-sm"
  >
    <span class="inline-flex items-center gap-1.5 font-semibold text-success-text">
      <span class="size-2 rounded-full bg-current" aria-hidden="true" />
      {{ $t('live.row') }}
    </span>
    <time class="text-text-secondary" :datetime="shown.iso" :title="shown.title">
      {{ $t('live.updated', { ago: shown.ago }) }}
    </time>
    <span class="text-text-muted" :title="formatBytes(shown.bytes)">
      {{ $t('live.rowDetail', { n: formatNumber(shown.changes) }, shown.changes) }}
    </span>
    <button
      v-if="deletable"
      type="button"
      class="ms-auto rounded-md px-2 py-1 text-text-secondary hover:bg-surface-overlay hover:text-danger-text disabled:opacity-50"
      :disabled="deleting"
      :title="$t('live.discardTitle')"
      @click="emit('delete')"
    >
      {{ $t('live.discard') }}
    </button>
  </div>
</template>
