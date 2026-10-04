<script setup lang="ts">
/** Empty state: says what is missing and offers the way to fill it. */
defineProps<{ title: string; body?: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 px-6 py-10 text-center">
    <div v-if="$slots.icon" class="text-text-muted [&_svg]:size-8">
      <slot name="icon" />
    </div>
    <h3 class="text-base font-semibold text-text-primary">{{ title }}</h3>
    <p v-if="body" class="max-w-md text-sm text-text-muted">{{ body }}</p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
