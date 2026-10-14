<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Ban, CircleCheck, CircleDashed, CircleEqual, CircleX, Clock, X } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import type { ImportItem, ImportStatus } from '@/data/import-queue'
import { t } from '@/i18n'
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format'

/**
 * The upload list, one compact row per file: name, size, status. Capture
 * time and stored bytes are in the row's tooltip; a failure shows the
 * server's reason. 100 rows at a time.
 */
const props = defineProps<{ items: ImportItem[]; busy: boolean }>()
const emit = defineEmits<{ remove: [id: number] }>()

const PAGE = 100
const shown = ref(PAGE)
const filter = ref<'all' | 'failed'>('all')

const failedCount = computed(() => props.items.filter((item) => item.status === 'failed').length)
const filterOptions = computed(() => [
  {
    value: 'all' as const,
    label: t('transfer.queue.all', { n: formatNumber(props.items.length) }),
  },
  {
    value: 'failed' as const,
    label: t('transfer.queue.failed', { n: formatNumber(failedCount.value) }),
  },
])
const filtered = computed(() =>
  filter.value === 'failed' ? props.items.filter((item) => item.status === 'failed') : props.items,
)
const visible = computed(() => filtered.value.slice(0, shown.value))

watch(filter, () => (shown.value = PAGE))
watch(failedCount, (count) => {
  if (count === 0) filter.value = 'all'
})

/** Each status's colour; its label is transfer.queue.state.<status>. */
const STATUS: Record<ImportStatus, { class: string }> = {
  queued: { class: 'text-text-muted' },
  uploading: { class: 'text-text-primary' },
  waiting: { class: 'text-warning-text' },
  created: { class: 'text-success-text' },
  unchanged: { class: 'text-text-secondary' },
  failed: { class: 'text-danger-text' },
  cancelled: { class: 'text-text-muted' },
}

function details(item: ImportItem): string {
  const parts = [item.path]
  if (item.takenAt) {
    parts.push(
      t(item.takenFromName ? 'transfer.queue.capturedFromName' : 'transfer.queue.captured', {
        time: formatDateTime(item.takenAt),
      }),
    )
  } else if (item.takenAt === null) parts.push(t('transfer.queue.noTime'))
  if (item.status === 'created' || item.status === 'unchanged') {
    parts.push(t('transfer.queue.stored', { size: formatBytes(item.storedSize ?? 0) }))
  }
  if (item.message) parts.push(item.message)
  return parts.join('\n')
}

function removable(item: ImportItem) {
  return (
    item.status === 'failed' ||
    item.status === 'cancelled' ||
    (item.status === 'queued' && !props.busy)
  )
}
</script>

<template>
  <div>
    <div v-if="failedCount > 0" class="border-b border-border-subtle px-5 py-3">
      <UiSegmented v-model="filter" :options="filterOptions" :label="$t('transfer.queue.show')" />
    </div>
    <table class="w-full table-fixed text-sm">
      <caption class="sr-only">
        {{
          $t('transfer.queue.caption')
        }}
      </caption>
      <thead class="text-left text-text-secondary">
        <tr class="border-b border-border-subtle">
          <th scope="col" class="py-2 pl-5 font-medium">{{ $t('transfer.queue.file') }}</th>
          <th scope="col" class="w-20 px-2 py-2 text-right font-medium">
            {{ $t('transfer.queue.size') }}
          </th>
          <th scope="col" class="w-12 px-2 py-2 font-medium sm:w-32">
            <span class="sr-only sm:not-sr-only">{{ $t('transfer.queue.status') }}</span>
          </th>
          <th scope="col" class="w-14 py-2 pr-3">
            <span class="sr-only">{{ $t('transfer.queue.remove') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in visible"
          :key="item.id"
          class="border-b border-border-subtle last:border-b-0"
          :title="details(item)"
        >
          <td class="py-1.5 pl-5">
            <span class="block truncate font-code">{{ item.name }}</span>
            <span
              v-if="item.status === 'failed' && item.message"
              class="block truncate text-danger-text"
              >{{ item.message }}</span
            >
          </td>
          <td class="tabular px-2 py-1.5 text-right font-mono whitespace-nowrap">
            {{ formatBytes(item.size) }}
          </td>
          <td class="px-2 py-1.5">
            <span
              class="inline-flex items-center gap-1.5 font-medium"
              :class="STATUS[item.status].class"
            >
              <UiSpinner v-if="item.status === 'uploading'" class="size-4 shrink-0" />
              <Clock
                v-else-if="item.status === 'waiting'"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <CircleCheck
                v-else-if="item.status === 'created'"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <CircleEqual
                v-else-if="item.status === 'unchanged'"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <CircleX
                v-else-if="item.status === 'failed'"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <Ban
                v-else-if="item.status === 'cancelled'"
                class="size-4 shrink-0"
                aria-hidden="true"
              />
              <CircleDashed v-else class="size-4 shrink-0" aria-hidden="true" />
              <span class="sr-only sm:not-sr-only">{{
                $t(`transfer.queue.state.${item.status}`)
              }}</span>
            </span>
          </td>
          <td class="py-0 pr-3 text-right">
            <button
              v-if="removable(item)"
              type="button"
              class="inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-overlay hover:text-text-primary"
              :aria-label="$t('transfer.queue.removeFile', { name: item.name })"
              :title="$t('transfer.queue.remove')"
              @click="emit('remove', item.id)"
            >
              <X class="size-4" aria-hidden="true" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="filtered.length > shown"
      class="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2"
    >
      <span class="tabular font-mono text-sm text-text-muted"
        >{{ formatNumber(visible.length) }}/{{ formatNumber(filtered.length) }}</span
      >
      <UiButton variant="ghost" @click="shown += PAGE">{{ $t('transfer.queue.more') }}</UiButton>
    </div>
  </div>
</template>
