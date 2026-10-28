<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Download } from 'lucide-vue-next'
import { CAPTURE_DOWNLOAD_URL } from '@/lib/capture-app'
import { formatRelative } from '@/lib/format'
import { liveSeenAt } from '@/live/journal'
import { useSession } from '@/stores/session'
import { captureDevice } from '@/stores/bootstrap'
import { t } from '@/i18n'
import { captureStatus } from './capture-status'

/**
 * The top bar's Capture button (design A, 2026-10-28): Teyvat.me Capture's
 * own icon with a dot for whether it is sending this account's data (live,
 * recent, idle). Opens Settings → Devices; with no capture app at all, the
 * download page.
 */
const props = defineProps<{
  account?: { id: number; latest: { lastSeenAt: number; source?: string } | null }
}>()

const session = useSession()
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(tick))

const status = computed(() =>
  captureStatus({
    latest: props.account?.latest ?? null,
    liveAt: props.account ? liveSeenAt.get(props.account.id) : undefined,
    device: captureDevice.value ?? null,
    userKey: session.me?.hasImportKey ?? false,
    now: now.value,
  }),
)

const label = computed(() => {
  const s = status.value
  if (s.state === 'none') return `${t('shell.capture.none')} · ${t('shell.capture.get')}`
  const parts = [t('shell.capture.name')]
  if (s.state === 'live') parts.push(t('shell.capture.live'))
  if (s.at !== null)
    parts.push(t('shell.capture.lastUpload', { time: formatRelative(s.at, now.value) }))
  if (s.device) parts.push(s.device)
  return parts.join(' · ')
})
</script>

<template>
  <a
    v-if="status.state === 'none'"
    :href="CAPTURE_DOWNLOAD_URL"
    target="_blank"
    rel="noopener noreferrer"
    class="capture-button"
    :aria-label="label"
    :title="label"
  >
    <span class="cap none">
      <img src="/capture-app.webp" alt="" class="tile" />
      <span class="dot none"><Download aria-hidden="true" /></span>
    </span>
  </a>
  <RouterLink
    v-else
    :to="{ name: 'settings-devices' }"
    class="capture-button"
    :aria-label="label"
    :title="label"
  >
    <span class="cap">
      <img src="/capture-app.webp" alt="" class="tile" />
      <span class="dot" :class="status.state" />
    </span>
  </RouterLink>
</template>

<style scoped>
.capture-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
}
.capture-button:hover,
.capture-button:focus-visible {
  background: var(--color-surface-overlay);
}
.cap {
  position: relative;
  display: inline-flex;
  width: 1.33rem;
  height: 1.33rem;
}
.tile {
  width: 100%;
  height: 100%;
  border-radius: 24%;
  /* The slate tile's edge, which a dark bar would swallow. */
  box-shadow: 0 0 0 1px rgb(148 163 184 / 0.3);
}
.cap.none .tile {
  filter: grayscale(1);
  opacity: 0.55;
}
.dot {
  position: absolute;
  right: -0.2rem;
  bottom: -0.2rem;
  width: 0.56rem;
  height: 0.56rem;
  border-radius: 50%;
  box-shadow: 0 0 0 0.125rem var(--color-surface-nav);
}
.dot.live,
.dot.recent {
  background: #10b981;
}
.dot.live::after {
  content: '';
  position: absolute;
  inset: -0.22rem;
  border: 0.11rem solid #10b981;
  border-radius: 50%;
  opacity: 0.35;
}
.dot.idle {
  background: var(--color-text-muted);
}
.dot.none {
  right: -0.25rem;
  bottom: -0.25rem;
  display: inline-flex;
  width: 0.67rem;
  height: 0.67rem;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-nav);
  color: var(--color-text-secondary);
  box-shadow: 0 0 0 0.083rem var(--color-border-strong);
}
.dot.none svg {
  width: 0.5rem;
  height: 0.5rem;
}
</style>
