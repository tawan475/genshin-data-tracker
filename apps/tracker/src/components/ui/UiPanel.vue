<script setup lang="ts">
/** The outermost container of a section: rounded-2xl, bordered, raised. */
defineProps<{ title?: string; description?: string; flush?: boolean }>()
</script>

<template>
  <section class="rounded-2xl border border-border-default bg-surface-raised shadow-card">
    <header
      v-if="title || $slots.actions || $slots.header"
      class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="font-display text-xl font-bold">{{ title }}</h2>
          <p v-if="description" class="mt-0.5 text-sm text-text-secondary">{{ description }}</p>
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
