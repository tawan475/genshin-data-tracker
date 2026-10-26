<script setup lang="ts">
import { Download, MonitorSmartphone } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import { CAPTURE_DOWNLOAD_URL } from '@/lib/capture-app'

/**
 * Wish history from the capture app: no paste, no file. Signed in to
 * teyvat.me, the app syncs every banner once the player opens Wish →
 * History, then each new wish while the game's key lasts (~24 h).
 */
</script>

<template>
  <div class="flex flex-col gap-3">
    <ol class="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text-secondary">
      <li>{{ $t('wishes.capture.steps.start') }}</li>
      <li>{{ $t('wishes.capture.steps.signIn') }}</li>
      <li :title="$t('wishes.capture.steps.openTitle')">{{ $t('wishes.capture.steps.open') }}</li>
    </ol>
    <div class="flex flex-wrap gap-2">
      <UiButton
        variant="primary"
        :href="CAPTURE_DOWNLOAD_URL"
        :title="$t('wishes.capture.downloadTitle')"
      >
        <Download class="size-4" aria-hidden="true" />
        {{ $t('wishes.capture.download') }}
      </UiButton>
      <UiButton :to="{ name: 'settings-devices' }">
        <MonitorSmartphone class="size-4" aria-hidden="true" />
        {{ $t('wishes.capture.devices') }}
      </UiButton>
    </div>
  </div>
</template>
