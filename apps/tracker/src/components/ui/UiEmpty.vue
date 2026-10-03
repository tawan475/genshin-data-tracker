<script setup lang="ts">
/** Empty state: says what is missing and offers the way to fill it. */
defineProps<{ title: string; body?: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <div v-if="$slots.icon" class="text-text-muted [&_svg]:size-8">
      <slot name="icon" />
    </div>
    <h3 class="font-display text-xl font-bold">{{ title }}</h3>
    <p v-if="body" class="max-w-md text-text-secondary">{{ body }}</p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
