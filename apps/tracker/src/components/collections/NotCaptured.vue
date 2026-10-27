<script setup lang="ts">
import { Library } from 'lucide-vue-next'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'

/** A Collections tab whose part no capture has had yet. */
defineProps<{ title: string }>()
</script>

<template>
  <UiPanel :title="title" flush>
    <UiEmpty
      :title="$t('collections.notCapturedPart')"
      :body="$t('collections.notCapturedPartBody')"
    >
      <template #icon><Library aria-hidden="true" /></template>
    </UiEmpty>
  </UiPanel>
</template>
