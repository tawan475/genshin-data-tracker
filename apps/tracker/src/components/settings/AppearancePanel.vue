<script setup lang="ts">
import UiPanel from '@/components/ui/UiPanel.vue'
import AppearanceControls from './AppearanceControls.vue'

/** Settings → Appearance: theme, language and clock (also the top bar's modal). */
</script>

<template>
  <UiPanel :title="$t('settings.appearance.title')">
    <AppearanceControls />
  </UiPanel>
</template>
