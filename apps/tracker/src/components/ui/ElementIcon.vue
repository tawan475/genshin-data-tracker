<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ELEMENT_TEXT } from '@/components/characters/tokens'
import { ELEMENT_LABELS } from '@/data/characters'
import type { Element } from '@/data/game-meta'
import { elementIcon } from '@/lib/assets'
import { ELEMENT_GLYPHS } from './element-glyphs'

/**
 * An element's icon: the game's own (lib/assets elementIcon, in the
 * element's colours), else, while there is none or it fails to load, our
 * glyph in the element's colour. `size`: sm (text size, in chips), md (the
 * default), lg (beside a card title). Named for screen readers and in a
 * tooltip, unless `decorative` (when the name is written next to it).
 * ElementBadge adds the name. A plain <img>, so the share card's PNG export
 * draws it.
 */
const props = withDefaults(
  defineProps<{ element: Element; decorative?: boolean; size?: 'sm' | 'md' | 'lg' }>(),
  { size: 'md' },
)
const SIZE = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const

const src = computed(() => elementIcon(props.element))
const failed = ref(false)
watch(src, () => (failed.value = false))

const glyph = computed(() => ELEMENT_GLYPHS[props.element])
const label = computed(() => ELEMENT_LABELS[props.element])
</script>

<template>
  <!-- Keyed by src: another element's icon gets a new <img>, never the old one while it loads. -->
  <img
    v-if="src && !failed"
    :key="src"
    :src="src"
    :alt="decorative ? '' : label"
    :title="decorative ? undefined : label"
    decoding="async"
    draggable="false"
    class="shrink-0 object-contain"
    :class="SIZE[size]"
    @error="failed = true"
  />
  <svg
    v-else
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
