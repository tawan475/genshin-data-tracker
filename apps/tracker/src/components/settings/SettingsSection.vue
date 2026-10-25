<script setup lang="ts">
/** A group of cards on Settings and Manage, under one small overline heading. */
defineProps<{ label: string }>()
</script>

<template>
  <section class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <h2 class="text-xs font-bold tracking-[0.15em] whitespace-nowrap text-text-muted uppercase">
        {{ label }}
      </h2>
      <div class="h-px flex-1 bg-border-default" />
    </div>
    <slot />
  </section>
</template>
