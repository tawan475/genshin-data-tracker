<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { Download, Repeat2, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import { currencyMissing } from '@/data/overview'
import { formatFullDateTime } from '@/lib/format'
import FigureCell from './FigureCell.vue'
import LegacyCheckbox from './LegacyCheckbox.vue'
import type { RowChanges } from './snapshot-figures'

/**
 * The Import History rows as stacked cards, for widths where the table's
 * columns don't fit: same figures, labelled, in the table's frame.
 */
defineProps<{
  rows: readonly SnapshotResponse[]
  changes: ReadonlyMap<number, RowChanges>
  isSelected: (id: number) => boolean
  /** Header box state for the filtered list. */
  coverage: 'none' | 'some' | 'all'
  downloading: ReadonlySet<number>
  deleting: boolean
  formatKb: (bytes: number) => string
}>()
const emit = defineEmits<{
  toggle: [id: number, event: MouseEvent | KeyboardEvent]
  toggleAll: []
  download: [snapshot: SnapshotResponse]
  delete: [snapshot: SnapshotResponse]
}>()

const FIGURES = [
  { key: 'characters', label: 'Characters', kind: 'count' },
  { key: 'artifacts', label: 'Artifacts', kind: 'count' },
  { key: 'weapons', label: 'Weapons', kind: 'count' },
  { key: 'mora', label: 'Mora', kind: 'mora' },
  { key: 'primogem', label: 'Primogems', kind: 'primogem' },
] as const
</script>

<template>
  <div
    class="@container border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-sm text-sm text-slate-700 dark:text-slate-300 transition-colors"
  >
    <div
      v-if="rows.length > 0"
      class="flex items-center gap-2 rounded-t-xl border-b border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 transition-colors"
    >
      <LegacyCheckbox
        class="-ml-1 size-10"
        :checked="coverage === 'all'"
        :mixed="coverage === 'some'"
        label="Select all shown"
        title="Select all shown"
        @toggle="emit('toggleAll')"
      />
      <span>All</span>
    </div>

    <ul class="divide-y divide-slate-100 dark:divide-slate-700/50">
      <li
        v-for="item in rows"
        :key="item.id"
        class="px-3 py-3 transition-colors"
        :class="isSelected(item.id) ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''"
      >
        <div class="flex items-start gap-2">
          <LegacyCheckbox
            class="-my-2.5 -ml-1 size-10 shrink-0"
            :checked="isSelected(item.id)"
            :label="`Select snapshot ${item.id}`"
            title="Shift-click to select a range"
            @toggle="(event) => emit('toggle', item.id, event)"
          />
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
              <span class="truncate">{{ formatFullDateTime(item.takenAt) }}</span>
              <span
                v-if="item.lastSeenAt > item.takenAt"
                class="shrink-0 text-slate-400 dark:text-slate-500"
                :title="`Unchanged until ${formatFullDateTime(item.lastSeenAt)}`"
              >
                <Repeat2 class="size-3.5" aria-hidden="true" />
                <span class="sr-only"
                  >Unchanged until {{ formatFullDateTime(item.lastSeenAt) }}</span
                >
              </span>
            </p>
            <p class="truncate text-xs text-slate-500 dark:text-slate-400">
              #{{ item.id }} · {{ item.source }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <BaseButton
              size="xs"
              variant="primary"
              :loading="downloading.has(item.id)"
              title="Download GOOD"
              @click="emit('download', item)"
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
              title="Delete Snapshot"
              @click="emit('delete', item)"
            >
              <template #icon>
                <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
              </template>
              Del
            </BaseButton>
          </div>
        </div>

        <dl class="mt-2 ml-11 grid grid-cols-3 gap-x-3 gap-y-2 @xl:grid-cols-6">
          <div v-for="figure in FIGURES" :key="figure.key" class="min-w-0">
            <dt class="text-xs text-slate-500 dark:text-slate-400">{{ figure.label }}</dt>
            <dd>
              <FigureCell
                :value="item.summary[figure.key]"
                :kind="figure.kind"
                :change="changes.get(item.id)?.[figure.key]"
                :missing="figure.kind !== 'count' && currencyMissing(item.summary)"
              />
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-slate-500 dark:text-slate-400">Stored</dt>
            <dd
              class="font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
              :title="`${formatKb(item.rawSize)} → ${formatKb(item.storedSize)}`"
            >
              {{ formatKb(item.storedSize) }}
            </dd>
          </div>
        </dl>
      </li>
    </ul>

    <div v-if="rows.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400">
      <slot name="empty" />
    </div>
  </div>
</template>
