<script setup lang="ts">
import type { AccountResponse, SnapshotResponse } from '@gdt/shared'
import { computed } from 'vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { formatBytes, formatNumber } from '@/lib/format'
import { dayKey, daySpan, rangeLabel } from './days'

/**
 * Count, time span, and what deduplication did to storage. Counts and bytes
 * come with the account; the span needs the snapshot list.
 */
const props = defineProps<{
  account: AccountResponse
  /** Newest first; undefined while loading. */
  snapshots: readonly SnapshotResponse[] | undefined
  captureDays: number
  loading: boolean
}>()

const span = computed(() => {
  const list = props.snapshots
  if (!list?.length) return null
  const newest = list[0]!.takenAt
  const oldest = list[list.length - 1]!.takenAt
  const days = daySpan(dayKey(oldest), dayKey(newest))
  return { days, label: rangeLabel(oldest, newest) }
})

const storedShare = computed(() => {
  const { rawBytes, storedBytes } = props.account
  if (rawBytes <= 0) return null
  const percent = (storedBytes / rawBytes) * 100
  return percent >= 10 ? percent.toFixed(0) : percent >= 1 ? percent.toFixed(1) : percent.toFixed(2)
})

const bytes = (n: number) => `${formatNumber(n)} bytes`
</script>

<template>
  <!-- Detail lives in each tile's tooltip (UiStat's `hint`). -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <UiStat
      label="Snapshots"
      :value="account.snapshotCount"
      exact
      :hint="snapshots ? `Captured on ${formatNumber(captureDays)} days` : undefined"
    />
    <div
      v-if="!snapshots && loading"
      class="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-raised p-4"
    >
      <span class="text-sm text-text-secondary">Span</span>
      <UiSkeleton class="h-8 w-24" />
    </div>
    <UiStat
      v-else
      label="Span"
      :value="span ? `${formatNumber(span.days)} ${span.days === 1 ? 'day' : 'days'}` : null"
      :hint="span?.label"
    />
    <UiStat
      label="Uploaded"
      :value="formatBytes(account.rawBytes)"
      :hint="bytes(account.rawBytes)"
    />
    <UiStat
      label="Stored"
      :value="formatBytes(account.storedBytes)"
      :hint="
        bytes(account.storedBytes) + (storedShare === null ? '' : ` · ${storedShare}% of uploaded`)
      "
    />
  </div>
</template>
