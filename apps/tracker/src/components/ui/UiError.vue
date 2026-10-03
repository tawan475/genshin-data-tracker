<script setup lang="ts">
import { computed } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import UiButton from './UiButton.vue'

/** Inline failure state for a section that could not load, with a retry. */
const props = defineProps<{ error: unknown; title?: string }>()
const emit = defineEmits<{ retry: [] }>()
const message = computed(() =>
  props.error instanceof Error ? props.error.message : 'Something went wrong.',
)
</script>

<template>
  <div
    class="flex flex-col items-start gap-3 rounded-xl border border-danger-border bg-danger-surface p-4"
    role="alert"
  >
    <div class="flex items-center gap-2 font-medium text-danger-text">
      <TriangleAlert class="size-5" aria-hidden="true" />
      {{ title ?? 'Could not load this' }}
    </div>
    <p class="text-sm text-text-secondary">{{ message }}</p>
    <UiButton size="sm" @click="emit('retry')">Try again</UiButton>
  </div>
</template>
