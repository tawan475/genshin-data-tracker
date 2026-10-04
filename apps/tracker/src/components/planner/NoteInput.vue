<script setup lang="ts">
/** A goal's free-text note (plain text, up to 1000 characters). */
const model = defineModel<string>({ required: true })
</script>

<template>
  <label class="flex flex-col gap-1">
    <span class="text-sm text-text-secondary">Note</span>
    <textarea
      v-model="model"
      rows="2"
      maxlength="1000"
      class="min-h-10 w-full resize-y rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary shadow-sm transition-colors placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
    />
  </label>
</template>
