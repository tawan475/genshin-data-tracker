<script setup lang="ts">
/** One per screen: the page title (font-display), a line of context, actions. */
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <p v-if="eyebrow" class="mb-1 text-sm font-semibold tracking-wide text-text-muted uppercase">
        {{ eyebrow }}
      </p>
      <h1 class="font-display text-3xl font-bold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1 text-text-secondary">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
