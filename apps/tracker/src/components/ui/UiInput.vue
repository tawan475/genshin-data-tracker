<script setup lang="ts">
defineProps<{ invalid?: boolean; mono?: boolean }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    class="min-h-10 w-full rounded-md border bg-surface-raised px-3 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:opacity-60"
    :class="[invalid ? 'border-danger' : 'border-border-strong', mono ? 'font-code' : '']"
    :aria-invalid="invalid || undefined"
  />
</template>
