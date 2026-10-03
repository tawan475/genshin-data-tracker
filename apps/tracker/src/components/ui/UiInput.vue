<script setup lang="ts">
/** Text input; pair with UiField for its label. */
defineProps<{ invalid?: boolean; mono?: boolean }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    class="min-h-11 w-full rounded-xl border bg-surface-raised px-3.5 text-base text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none disabled:opacity-60"
    :class="[invalid ? 'border-danger-border' : 'border-border-default', mono ? 'font-mono' : '']"
    :aria-invalid="invalid || undefined"
  />
</template>
