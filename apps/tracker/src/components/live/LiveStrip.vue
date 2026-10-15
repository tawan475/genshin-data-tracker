<script setup lang="ts">
import type { LiveJournalResponse, SnapshotResponse } from '@gdt/shared'
import { computed } from 'vue'
import ChangeValue from '@/components/overview/ChangeValue.vue'
import { liveStrip } from '@/data/live-strip'
import { t } from '@/i18n'
import { formatDateTime, formatRelative } from '@/lib/format'

/**
 * ● Live · this session: +1.2M Mora · +14 artifacts · 2 level-ups · updated
 * 20 s ago. Shown on Overview while a live journal with changes is open.
 */
const props = defineProps<{
  live: LiveJournalResponse | null | undefined
  snapshots: readonly SnapshotResponse[]
  now: number
}>()

const strip = computed(() => liveStrip(props.live, props.snapshots))
const updated = computed(() =>
  strip.value
    ? {
        iso: new Date(strip.value.updatedAt).toISOString(),
        ago: formatRelative(strip.value.updatedAt, props.now),
        title: t('live.updatedAt', { time: formatDateTime(strip.value.updatedAt) }),
      }
    : null,
)
const since = computed(() =>
  strip.value ? t('live.sessionSince', { time: formatDateTime(strip.value.since) }) : '',
)
</script>

<template>
  <div
    v-if="strip && updated"
    class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border-subtle bg-surface-raised px-4 py-2 text-sm"
    role="status"
  >
    <span class="inline-flex items-center gap-1.5 font-medium text-success-text">
      <span class="relative flex size-2" aria-hidden="true">
        <span
          class="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none"
        />
        <span class="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {{ $t('live.label') }}
    </span>
    <span class="text-text-secondary" :title="since">{{ $t('live.thisSession') }}</span>
    <span class="text-text-secondary">
      {{ $t('overview.figure.mora') }} <ChangeValue :value="strip.mora" :hint="since" />
    </span>
    <span v-if="strip.primogem" class="text-text-secondary">
      {{ $t('overview.figure.primogem') }} <ChangeValue :value="strip.primogem" :hint="since" />
    </span>
    <span v-if="strip.artifacts" class="text-text-secondary">
      {{ $t('overview.figure.artifacts') }}
      <ChangeValue :value="strip.artifacts" exact :hint="since" />
    </span>
    <span v-if="strip.levelUps" class="text-text-secondary">
      {{ $t('live.levelUps', { n: strip.levelUps }, strip.levelUps) }}
    </span>
    <span v-if="strip.talents" class="text-text-secondary">
      {{ $t('live.talents', { n: strip.talents }, strip.talents) }}
    </span>
    <time class="ms-auto text-text-muted" :datetime="updated.iso" :title="updated.title">
      {{ $t('live.updated', { ago: updated.ago }) }}
    </time>
  </div>
</template>
