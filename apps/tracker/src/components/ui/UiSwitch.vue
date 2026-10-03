<script setup lang="ts">
/** On/off setting with its label and an optional description. */
defineProps<{ label: string; description?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex cursor-pointer items-start justify-between gap-4 py-2">
    <span class="flex flex-col">
      <span class="text-sm font-medium">{{ label }}</span>
      <span v-if="description" class="text-sm text-text-muted">{{ description }}</span>
    </span>
    <span class="relative mt-0.5 inline-flex shrink-0">
      <input v-model="model" type="checkbox" role="switch" class="peer sr-only" />
      <span
        class="h-6 w-11 rounded-full bg-surface-overlay ring-1 ring-border-strong transition-colors ring-inset peer-checked:bg-accent peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
      />
      <span
        class="absolute top-1 left-1 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
      />
    </span>
  </label>
</template>
