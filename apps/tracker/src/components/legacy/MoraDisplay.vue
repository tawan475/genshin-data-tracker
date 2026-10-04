<script setup lang="ts">
import { materialIcon } from '@/lib/assets'

defineProps<{
  amount: number
}>()

const mora = materialIcon('Mora')
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap">
    <span>{{ amount.toLocaleString() }}</span>
    <!-- Visually hidden text so copying works -->
    <span class="sr-only">&nbsp;mora</span>
    <img
      :src="mora"
      alt=""
      class="w-4 h-4 max-w-none shrink-0 select-none pointer-events-none object-contain"
      aria-hidden="true"
    />
  </span>
</template>
