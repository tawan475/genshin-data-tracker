<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="mb-2 flex items-center gap-3 px-1">
    <h3 class="text-xs font-bold tracking-[0.15em] text-text-muted uppercase">
      {{ label }}
    </h3>
    <div class="h-px flex-1 bg-border-default" />
  </div>
</template>
