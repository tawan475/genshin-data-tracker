<script setup lang="ts">
/** On/off setting with its label and an optional description. */
defineProps<{ label: string; description?: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="flex cursor-pointer items-start justify-between gap-4 py-2">
    <span class="flex flex-col">
      <span class="text-base">{{ label }}</span>
      <span v-if="description" class="text-sm text-text-muted">{{ description }}</span>
    </span>
    <span class="relative mt-0.5 inline-flex shrink-0">
      <input v-model="model" type="checkbox" role="switch" class="peer sr-only" />
      <span
        class="h-6 w-11 rounded-full border border-border-strong bg-surface-sunken transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
      />
      <span
        class="absolute top-1 left-1 size-4 rounded-full bg-text-secondary transition-transform peer-checked:translate-x-5 peer-checked:bg-accent-ink"
      />
    </span>
  </label>
</template>
