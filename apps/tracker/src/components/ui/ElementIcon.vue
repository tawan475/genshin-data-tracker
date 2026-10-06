<script setup lang="ts">
import { computed } from 'vue'
import { ELEMENT_TEXT } from '@/components/characters/tokens'
import { ELEMENT_LABELS } from '@/data/characters'
import type { Element } from '@/data/game-meta'
import { ELEMENT_GLYPHS } from './element-glyphs'

/**
 * An element's symbol in its colour. `size`: sm (text size, in chips), md
 * (the default), lg (beside a card title). Named for screen readers and in
 * a tooltip, unless `decorative` (when the name is written next to it).
 * ElementBadge adds the name.
 */
const props = withDefaults(
  defineProps<{ element: Element; decorative?: boolean; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)
const SIZE = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const

const glyph = computed(() => ELEMENT_GLYPHS[props.element])
const label = computed(() => ELEMENT_LABELS[props.element])
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    class="shrink-0"
    :class="[SIZE[size], ELEMENT_TEXT[element]]"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="decorative ? undefined : label"
  >
    <title v-if="!decorative">{{ label }}</title>
    <path v-if="glyph.fill" :d="glyph.fill" fill="currentColor" fill-rule="evenodd" />
    <g
      v-if="glyph.stroke"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        v-for="angle in glyph.rotate ?? [0]"
        :key="angle"
        :d="glyph.stroke"
        :transform="angle ? `rotate(${angle} 12 12)` : undefined"
      />
    </g>
  </svg>
</template>
