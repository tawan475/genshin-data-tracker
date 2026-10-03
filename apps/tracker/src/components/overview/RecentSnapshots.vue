<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed } from 'vue'
import { ArrowRight, Eye } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { recentSnapshots } from '@/data/overview'
import ChangeValue from './ChangeValue.vue'

/** The newest five snapshots, each with what changed against the one before. */
const props = defineProps<{ snapshots: SnapshotResponse[]; accountId: number; now: number }>()

const items = computed(() =>
  recentSnapshots(props.snapshots, 5).map((s) => ({
    id: s.id,
    iso: new Date(s.takenAt).toISOString(),
    exact: formatDateTime(s.takenAt),
    ago: formatRelative(s.takenAt, props.now),
    seenAgain: s.seenAgainAt
      ? {
          iso: new Date(s.seenAgainAt).toISOString(),
          ago: formatRelative(s.seenAgainAt, props.now),
          title: `Seen again ${formatDateTime(s.seenAgainAt)}`,
        }
      : null,
    source: s.source,
    size: `${formatBytes(s.rawSize)} → ${formatBytes(s.storedSize)}`,
    sizeTitle: `${formatNumber(s.rawSize)} bytes uploaded, ${formatNumber(s.storedSize)} bytes stored`,
    changes: s.changes,
    note: s.changes.length ? null : s.hasPrevious ? 'Totals unchanged' : 'First snapshot',
    currencyMissing: s.currencyMissing,
  })),
)
</script>

<template>
  <UiPanel title="Recent" flush>
    <template #actions>
      <UiButton
        size="sm"
        variant="ghost"
        :to="{ name: 'account-snapshots', params: { accountId } }"
        :title="`All ${formatNumber(snapshots.length)} snapshots`"
      >
        All
        <ArrowRight class="size-4" aria-hidden="true" />
      </UiButton>
    </template>

    <ul class="divide-y divide-border-subtle">
      <li v-for="item in items" :key="item.id" class="flex flex-col gap-1 px-5 py-3">
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <time :datetime="item.iso" :title="item.exact" class="font-medium">{{ item.ago }}</time>
          <span class="flex items-center gap-2">
            <UiBadge v-if="item.currencyMissing" tone="warning" title="Mora and primogems missing">
              No currency
            </UiBadge>
            <UiBadge>{{ item.source }}</UiBadge>
          </span>
        </div>

        <p v-if="item.changes.length" class="flex flex-wrap gap-x-4">
          <span v-for="change in item.changes" :key="change.label" class="text-text-secondary">
            {{ change.label }}
            <ChangeValue :value="change.value" exact />
          </span>
        </p>
        <p v-else class="text-text-muted">{{ item.note }}</p>

        <p class="flex flex-wrap items-center gap-x-3 text-sm text-text-muted">
          <span class="tabular font-mono" :title="item.sizeTitle">{{ item.size }}</span>
          <span v-if="item.seenAgain" class="inline-flex items-center gap-1">
            <Eye class="size-4" aria-hidden="true" />
            <span class="sr-only">Seen again</span>
            <time :datetime="item.seenAgain.iso" :title="item.seenAgain.title">{{
              item.seenAgain.ago
            }}</time>
          </span>
        </p>
      </li>
    </ul>
  </UiPanel>
</template>
