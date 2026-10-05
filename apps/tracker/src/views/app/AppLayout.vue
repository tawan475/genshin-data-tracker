<script setup lang="ts">
import AppShell from '@/components/shell/AppShell.vue'
import { useLiveUpdates } from '@/live/live-updates'

// Pages update as data arrives (irminsul uploads, other tabs and devices).
useLiveUpdates()
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
