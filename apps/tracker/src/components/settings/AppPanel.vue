<script setup lang="ts">
import { ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { CircleCheck, Download, Share, SquarePlus } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { installPrompt, isStandalone } from '@/pwa/register'
import { useFeedback } from '@/stores/feedback'
import BuildInfo from './BuildInfo.vue'

/**
 * Installing the PWA, and what build the server runs.
 *
 * Chromium offers a one-shot install prompt (captured in pwa/register.ts);
 * iOS Safari never does, so it gets the Share → Add to Home Screen steps.
 */
const feedback = useFeedback()

const standalone = isStandalone()
const installedNow = ref(false)
const installing = ref(false)

const ua = navigator.userAgent
const ios =
  /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)

useEventListener(window, 'appinstalled', () => (installedNow.value = true))

type InstallEvent = {
  prompt: () => Promise<unknown>
  userChoice?: Promise<{ outcome?: string }>
}

async function install() {
  const event = installPrompt.value as InstallEvent | null
  if (!event) return
  installing.value = true
  try {
    const result = (await event.prompt()) as { outcome?: string } | undefined
    const outcome = result?.outcome ?? (await event.userChoice)?.outcome
    if (outcome === 'accepted') installedNow.value = true
  } catch (error) {
    feedback.error('Could not open the install prompt', error)
  } finally {
    // The browser lets each prompt event be used once.
    installPrompt.value = null
    installing.value = false
  }
}
</script>

<template>
  <UiPanel title="App" description="Install the tracker and see what the server is running.">
    <div class="flex flex-col gap-6">
      <div>
        <h3 class="font-display text-lg font-bold">Install</h3>
        <p class="mt-1 text-text-secondary">
          Opens in its own window, straight to your accounts. The app shell loads offline; your data
          needs a connection.
        </p>

        <p v-if="standalone" class="mt-3 flex items-center gap-2 text-success-text">
          <CircleCheck class="size-5 shrink-0" aria-hidden="true" />
          Installed. You are using the app now.
        </p>
        <p v-else-if="installedNow" class="mt-3 flex items-center gap-2 text-success-text">
          <CircleCheck class="size-5 shrink-0" aria-hidden="true" />
          Installed. Open GI Tracker from your home screen or app list.
        </p>
        <div v-else-if="installPrompt" class="mt-3">
          <UiButton :loading="installing" @click="install">
            <Download v-if="!installing" class="size-5" aria-hidden="true" />
            Install app
          </UiButton>
        </div>
        <ol v-else-if="ios" class="mt-3 flex flex-col gap-2 text-text-secondary">
          <li class="flex gap-3">
            <span class="tabular font-mono text-sm leading-6 text-text-muted">1</span>
            <span>
              Open this page in Safari and tap
              <Share class="inline size-5 align-text-bottom text-text-primary" aria-hidden="true" />
              <span class="font-medium text-text-primary">Share</span>.
            </span>
          </li>
          <li class="flex gap-3">
            <span class="tabular font-mono text-sm leading-6 text-text-muted">2</span>
            <span>
              Choose
              <SquarePlus
                class="inline size-5 align-text-bottom text-text-primary"
                aria-hidden="true"
              />
              <span class="font-medium text-text-primary">Add to Home Screen</span>.
            </span>
          </li>
        </ol>
        <p v-else class="mt-3 text-sm text-text-muted">
          Your browser has not offered to install it. In Chrome or Edge, use the install icon in the
          address bar or “Install” in the menu. Browsers without installation work the same in a
          tab.
        </p>
      </div>

      <div class="border-t border-border-subtle pt-5">
        <BuildInfo />
      </div>
    </div>
  </UiPanel>
</template>
