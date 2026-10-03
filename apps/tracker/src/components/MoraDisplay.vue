<script setup lang="ts">
defineProps<{
  amount: number
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap">
    <span>{{ amount.toLocaleString() }}</span>
    <!-- Visually hidden text so copying works -->
    <span class="sr-only">&nbsp;mora</span>
    <img 
      src="/img/Item_Mora.webp" 
      alt="" 
      class="w-4 h-4 select-none pointer-events-none object-contain" 
      aria-hidden="true" 
    />
  </span>
</template>
