<script setup lang="ts">
import { ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { applyUpdate, updateAvailable } from '@/pwa/register'
import UiButton from '../ui/UiButton.vue'

const dismissed = ref(false)
</script>

<template>
  <div
    v-if="updateAvailable && !dismissed"
    class="fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border-default bg-surface-raised p-3 shadow-overlay"
    role="status"
  >
    <RefreshCw class="size-5 shrink-0 text-accent-text" aria-hidden="true" />
    <p class="flex-1 text-sm">A new version of the tracker is ready.</p>
    <UiButton size="sm" variant="ghost" @click="dismissed = true">Later</UiButton>
    <UiButton size="sm" variant="primary" @click="applyUpdate">Reload</UiButton>
  </div>
</template>
