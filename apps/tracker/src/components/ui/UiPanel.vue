<script setup lang="ts">
defineProps<{ title?: string; description?: string; flush?: boolean }>()
</script>

<template>
  <section class="rounded-xl border border-border-default bg-surface-raised shadow-sm">
    <!-- min-h: as tall as a header holding an sm button, so panels side by side line up. -->
    <header
      v-if="title || $slots.actions || $slots.header"
      class="flex min-h-[calc(3.75rem+1px)] flex-wrap items-center justify-between gap-3 border-b border-border-default px-5 py-3.5"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">{{ title }}</h2>
          <p v-if="description" class="text-sm text-text-muted">{{ description }}</p>
        </div>
      </slot>
      <!-- min-w-0: a row of actions that scrolls sideways on phones stays inside the header. -->
      <div v-if="$slots.actions" class="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="flush ? '' : 'p-5'">
      <slot />
    </div>
  </section>
</template>
