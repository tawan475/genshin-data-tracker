<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Info } from 'lucide-vue-next'
import { formatDateTime, formatRelative } from '@/lib/format'

/** A tab's "newest capture" line: when the part shown was captured, or that it was not. */
const props = defineProps<{ takenAt: number | null | undefined }>()

const time = computed(() =>
  props.takenAt == null
    ? null
    : {
        iso: new Date(props.takenAt).toISOString(),
        ago: formatRelative(props.takenAt),
        title: formatDateTime(props.takenAt),
      },
)
</script>

<template>
  <p v-if="time" class="flex items-center gap-1.5 text-text-secondary">
    <Clock class="size-4" aria-hidden="true" />
    <span class="sr-only">{{ $t('collections.newestCapture') }}</span>
    <time
      :datetime="time.iso"
      :title="$t('collections.newestCaptureTitle', { time: time.title })"
      >{{ time.ago }}</time
    >
  </p>
  <p
    v-else
    class="flex items-center gap-1.5 text-text-secondary"
    :title="$t('collections.notCapturedTitle')"
  >
    <Info class="size-4 shrink-0" aria-hidden="true" />
    {{ $t('collections.notCaptured') }}
  </p>
</template>
