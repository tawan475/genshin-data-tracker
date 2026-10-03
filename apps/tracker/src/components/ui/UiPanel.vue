<script setup lang="ts">
defineProps<{ title?: string; description?: string; flush?: boolean }>()
</script>

<template>
  <section class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <header
      v-if="title || $slots.actions || $slots.header"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-3.5"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">{{ title }}</h2>
          <p v-if="description" class="text-sm text-text-muted">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="flush ? '' : 'p-5'">
      <slot />
    </div>
  </section>
</template>
