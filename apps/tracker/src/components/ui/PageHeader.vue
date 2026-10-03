<script setup lang="ts">
defineProps<{ title: string; description?: string; eyebrow?: string }>()
</script>

<template>
  <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div class="min-w-0">
      <p v-if="eyebrow" class="text-xs font-bold tracking-[0.15em] text-text-muted uppercase">
        {{ eyebrow }}
      </p>
      <h1 class="truncate text-2xl font-bold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-0.5 text-sm text-text-muted">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
