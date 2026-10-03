<script setup lang="ts">
import { SearchX } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <UiEmpty title="Page not found" body="The link may be old, or the page moved.">
      <template #icon><SearchX aria-hidden="true" /></template>
      <UiButton variant="primary" :to="{ name: 'home' }">Go to the dashboard</UiButton>
    </UiEmpty>
  </div>
</template>
