<script setup lang="ts">
import { Info } from 'lucide-vue-next'

/**
 * A tab's note that the part shown was never captured. When the account last
 * synced is in the top bar, not on each page.
 */
defineProps<{ takenAt: number | null | undefined }>()
</script>

<template>
  <p
    v-if="takenAt == null"
    class="flex items-center gap-1.5 text-text-secondary"
    :title="$t('collections.notCapturedTitle')"
  >
    <Info class="size-4 shrink-0" aria-hidden="true" />
    {{ $t('collections.notCaptured') }}
  </p>
</template>
