<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import SessionsPanel from '@/components/settings/SessionsPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'

/**
 * Settings → Devices on a page of its own: irminsul's Configure button lands
 * here (`?device=<sid>` highlights that PC's row), so the row is the first
 * thing on screen.
 */
</script>

<template>
  <PageHeader :title="$t('shell.page.devices')">
    <template #meta>
      <UiButton variant="ghost" size="sm" :to="{ name: 'settings' }">
        <ChevronLeft class="size-4" aria-hidden="true" />
        {{ $t('shell.settings') }}
      </UiButton>
    </template>
  </PageHeader>
  <div class="mx-auto w-full max-w-4xl">
    <SessionsPanel />
  </div>
</template>
