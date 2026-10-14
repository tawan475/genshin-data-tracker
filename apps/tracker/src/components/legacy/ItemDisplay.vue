<script setup lang="ts">
import { formatNumber } from '@/lib/format'
defineProps<{
  amount: number | string
  image: string
  name: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap">
    <span>{{ typeof amount === 'number' ? formatNumber(amount) : amount }}</span>
    <span class="sr-only">&nbsp;{{ name }}</span>
    <img
      :src="image"
      alt=""
      class="w-4 h-4 max-w-none shrink-0 select-none pointer-events-none object-contain"
      aria-hidden="true"
    />
  </span>
</template>
