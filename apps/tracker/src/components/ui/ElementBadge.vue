<script setup lang="ts">
import { ELEMENT_LABELS } from '@/data/characters'
import type { Element } from '@/data/game-meta'
import ElementIcon from './ElementIcon.vue'

/** The element's symbol in its colour, then its name ("Pyro") in the surrounding text colour. */
defineProps<{ element: Element }>()
</script>

<template>
  <span class="inline-flex items-center gap-1 whitespace-nowrap">
    <ElementIcon :element="element" decorative />
    {{ ELEMENT_LABELS[element] }}
  </span>
</template>
