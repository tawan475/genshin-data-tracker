<script setup lang="ts">
import type { Element } from '@/data/characters'
import { ELEMENT_FILL } from './tokens'

/** C0–C6 as six pips in the character's element colour, plus "C4" in mono. */
defineProps<{ value: number; element: Element | null }>()
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <span
      class="inline-flex items-center gap-1"
      role="img"
      :aria-label="`Constellation ${value} of 6`"
    >
      <span
        v-for="n in 6"
        :key="n"
        class="size-2 rounded-full"
        :class="
          n <= value ? (element ? ELEMENT_FILL[element] : 'bg-text-secondary') : 'bg-border-default'
        "
      />
    </span>
    <span class="tabular font-mono text-sm text-text-secondary" aria-hidden="true">
      C{{ value }}
    </span>
  </span>
</template>
