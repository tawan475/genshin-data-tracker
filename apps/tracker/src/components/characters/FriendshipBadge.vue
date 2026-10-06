<script setup lang="ts">
/** Friendship as the game words it: "Friendship 10". `bare` is the number alone (a "Friendship" column). */
defineProps<{ level: number; bare?: boolean }>()
</script>

<template>
  <span
    class="inline-flex items-baseline gap-1 whitespace-nowrap"
    :title="`Friendship ${level} of 10`"
  >
    <span v-if="!bare">Friendship</span>
    <span class="tabular font-mono" :class="level >= 10 ? 'font-semibold text-text-primary' : ''">{{
      level
    }}</span>
  </span>
</template>
