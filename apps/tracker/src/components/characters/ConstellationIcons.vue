<script setup lang="ts">
import { computed } from 'vue'
import type { Element } from '@/data/game-meta'
import ElementDisc from './ElementDisc.vue'
import { constellationIcons } from './talent-icons'

/**
 * The six constellations as the game's own icons on dark discs ringed in
 * the element colour (ElementDisc), Enka-style; locked ones dimmed with a
 * lock. A column by default (beside splash art); space it out with
 * `justify-between` and a height from outside.
 */
const props = withDefaults(
  defineProps<{
    characterKey: string
    value: number
    element: Element | null
    size?: 'md' | 'lg' | 'xl'
  }>(),
  { size: 'md' },
)

const icons = computed(() => constellationIcons(props.characterKey))
const level = computed(() => Math.min(6, Math.max(0, Math.trunc(props.value) || 0)))
</script>

<template>
  <ol class="flex flex-col gap-2" :aria-label="`Constellation ${level} of 6`">
    <li
      v-for="(src, index) in icons"
      :key="index"
      class="flex"
      :title="`C${index + 1}${index < level ? '' : ' · locked'}`"
    >
      <ElementDisc
        :src="src"
        :element="element"
        :size="size"
        :locked="index >= level"
        :fallback="`C${index + 1}`"
      />
      <span class="sr-only">C{{ index + 1 }} {{ index < level ? 'unlocked' : 'locked' }}</span>
    </li>
  </ol>
</template>
