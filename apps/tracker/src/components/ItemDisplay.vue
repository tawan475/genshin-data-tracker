<script setup lang="ts">
defineProps<{
  amount: number | string
  image: string
  name: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap">
    <span>{{ typeof amount === 'number' ? amount.toLocaleString() : amount }}</span>
    <span class="sr-only">&nbsp;{{ name }}</span>
    <img 
      :src="image" 
      alt="" 
      class="w-4 h-4 select-none pointer-events-none object-contain" 
      aria-hidden="true" 
    />
  </span>
</template>
