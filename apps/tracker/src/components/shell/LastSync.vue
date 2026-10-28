<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { formatDateTime, formatRelative } from '@/lib/format'
import { liveSeenAt } from '@/live/journal'
import { t } from '@/i18n'

/**
 * The top bar's "Synced 13 minutes ago" for the account shown: when its data
 * last arrived (a capture, the same data again, or a live-sync change). The
 * one place the app says it; pages don't repeat it.
 */
const props = defineProps<{ account: { id: number; latest: { lastSeenAt: number } | null } }>()

const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(tick))

const sync = computed(() => {
  const latest = props.account.latest
  if (!latest) return null
  const at = Math.max(latest.lastSeenAt, liveSeenAt.get(props.account.id) ?? 0)
  return {
    iso: new Date(at).toISOString(),
    text: t('shell.lastSync', { time: formatRelative(at, now.value) }),
    title: t('shell.lastSync', { time: formatDateTime(at) }),
  }
})
</script>

<template>
  <template v-if="sync">
    <span class="hidden md:inline" aria-hidden="true">·</span>
    <time
      class="hidden shrink-0 px-1 whitespace-nowrap md:inline"
      :datetime="sync.iso"
      :title="sync.title"
      >{{ sync.text }}</time
    >
  </template>
</template>
