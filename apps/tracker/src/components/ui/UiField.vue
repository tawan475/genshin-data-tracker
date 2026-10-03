<script setup lang="ts">
import { useId } from 'vue'

/**
 * Label + control + hint/error. The slot receives `id` and `describedBy` to
 * put on the control, so the label and messages are wired for screen readers.
 */
const props = defineProps<{ label: string; hint?: string; error?: string; optional?: boolean }>()
const id = useId()
const hintId = `${id}-hint`
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-text-secondary">
      {{ label }}
      <span v-if="optional" class="font-normal text-text-muted">(optional)</span>
    </label>
    <slot
      :id="id"
      :described-by="props.error || props.hint ? hintId : undefined"
      :invalid="!!props.error"
    />
    <p v-if="error" :id="hintId" class="text-sm text-danger-text" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="text-sm text-text-muted">{{ hint }}</p>
  </div>
</template>
