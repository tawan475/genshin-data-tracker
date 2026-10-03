<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed } from 'vue'
import { Download, Repeat2, Trash2 } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { formatBytes, formatDateTime, formatNumber, formatSigned, formatTime } from '@/lib/format'
import { COLUMN } from './columns'
import { formatGap } from './days'

/**
 * One capture. Below md it is a card (figures wrap under the time, labelled);
 * from md up its figures line up in columns under the day header's labels.
 */
const props = defineProps<{
  snapshot: SnapshotResponse
  previous: SnapshotResponse | null
  selected: boolean
  downloading: boolean
}>()
const emit = defineEmits<{ toggle: []; download: []; delete: [] }>()

const exact = computed(() => formatDateTime(props.snapshot.takenAt))
const iso = computed(() => new Date(props.snapshot.takenAt).toISOString())
/** The same inventory was uploaded again later (stored once, `lastSeenAt` moved). */
const seenFor = computed(() => props.snapshot.lastSeenAt - props.snapshot.takenAt)

const summary = computed(() => props.snapshot.summary)
const artifactsDelta = computed(() =>
  props.previous ? summary.value.artifacts - props.previous.summary.artifacts : null,
)
const moraDelta = computed(() =>
  props.previous ? summary.value.mora - props.previous.summary.mora : null,
)
const moraTone = computed(() => {
  const delta = moraDelta.value
  if (delta === null || delta === 0) return 'text-text-muted'
  return delta > 0 ? 'text-success-text' : 'text-danger-text'
})
const moraTitle = computed(() =>
  moraDelta.value === null
    ? `${formatNumber(summary.value.mora)} Mora; no earlier snapshot`
    : `${formatNumber(summary.value.mora)} Mora (${formatSigned(moraDelta.value)} since previous)`,
)
const artifactsTitle = computed(() =>
  artifactsDelta.value === null
    ? `${formatNumber(summary.value.artifacts)} artifacts`
    : `${formatNumber(summary.value.artifacts)} artifacts (${formatSigned(artifactsDelta.value)} since previous)`,
)
const bytes = (n: number) => `${formatNumber(n)} bytes`
</script>

<template>
  <li
    class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 md:flex-nowrap md:px-3"
    :class="selected ? 'bg-surface-overlay' : ''"
  >
    <label class="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        class="size-5 cursor-pointer accent-accent"
        :checked="selected"
        @change="emit('toggle')"
      />
      <span class="sr-only">Select {{ exact }}</span>
    </label>

    <p class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
      <time :datetime="iso" :title="exact" class="tabular font-mono font-medium">
        {{ formatTime(snapshot.takenAt) }}
      </time>
      <span class="truncate text-sm text-text-secondary">{{ snapshot.source }}</span>
      <span
        v-if="seenFor > 0"
        class="inline-flex items-center gap-1 self-center text-sm text-text-muted"
        :title="`Seen again unchanged until ${formatDateTime(snapshot.lastSeenAt)}`"
      >
        <Repeat2 class="size-4" aria-hidden="true" />
        <span class="sr-only">Seen again for</span>
        <span class="tabular font-mono">{{ formatGap(seenFor) }}</span>
      </span>
    </p>

    <dl
      class="order-last flex basis-full flex-wrap gap-x-4 gap-y-0.5 pl-14 text-sm md:order-none md:basis-auto md:flex-nowrap md:gap-x-2 md:pl-0"
    >
      <div class="flex gap-1.5 md:block md:text-right" :class="COLUMN.artifacts">
        <dt class="text-text-muted md:sr-only">Artifacts</dt>
        <dd class="tabular font-mono" :title="artifactsTitle">
          {{ formatNumber(summary.artifacts) }}
        </dd>
      </div>
      <div class="flex gap-1.5 md:block md:text-right" :class="COLUMN.mora">
        <dt class="text-text-muted md:sr-only">Mora</dt>
        <dd class="tabular font-mono" :class="moraTone" :title="moraTitle">
          {{ moraDelta === null ? '—' : formatSigned(moraDelta) }}
        </dd>
      </div>
      <div class="flex gap-1.5 md:block md:text-right" :class="COLUMN.uploaded">
        <dt class="text-text-muted md:sr-only">Uploaded</dt>
        <dd class="tabular font-mono" :title="bytes(snapshot.rawSize)">
          {{ formatBytes(snapshot.rawSize) }}
        </dd>
      </div>
      <div class="flex gap-1.5 md:block md:text-right" :class="COLUMN.stored">
        <dt class="text-text-muted md:sr-only">Stored</dt>
        <dd class="tabular font-mono" :title="bytes(snapshot.storedSize)">
          {{ formatBytes(snapshot.storedSize) }}
        </dd>
      </div>
    </dl>

    <div class="flex shrink-0 items-center" :class="COLUMN.actions">
      <UiIconButton :label="`Download ${exact}`" :disabled="downloading" @click="emit('download')">
        <UiSpinner v-if="downloading" class="size-4" />
        <Download v-else class="size-5" aria-hidden="true" />
      </UiIconButton>
      <UiIconButton :label="`Delete ${exact}`" @click="emit('delete')">
        <Trash2 class="size-5" aria-hidden="true" />
      </UiIconButton>
    </div>
  </li>
</template>
