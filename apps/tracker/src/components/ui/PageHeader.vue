<script setup lang="ts">
/**
 * The top bar already shows the page title, so it is only announced here
 * (screen readers still get one h1 per page); visible are the page's own
 * figures and actions.
 */
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>

<template>
  <h1 class="sr-only">{{ title }}</h1>
  <header
    v-if="$slots.meta || $slots.actions"
    class="mb-6 flex flex-wrap items-center justify-between gap-3"
  >
    <div class="min-w-0">
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
