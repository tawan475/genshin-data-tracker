<script setup lang="ts">
import { Heart } from 'lucide-vue-next'

/** Friendship level as a small heart and the number; the cap (10) fills the heart. */
defineProps<{ level: number }>()
</script>

<template>
  <span class="tabular inline-flex items-center gap-0.5 font-mono" :title="`Friendship ${level}`">
    <Heart
      class="size-3.5 shrink-0 text-pyro"
      :class="level >= 10 ? 'fill-current' : ''"
      aria-hidden="true"
    />
    <span class="sr-only">Friendship</span>
    {{ level }}
  </span>
</template>
