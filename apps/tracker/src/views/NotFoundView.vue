<script setup lang="ts">
import { SearchX } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <UiEmpty :title="$t('shell.notFound.title')" :body="$t('shell.notFound.body')">
      <template #icon><SearchX aria-hidden="true" /></template>
      <UiButton variant="primary" :to="{ name: 'home' }">{{ $t('shell.notFound.home') }}</UiButton>
    </UiEmpty>
  </div>
</template>
