<script setup lang="ts">
import { computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { Element } from '@/data/game-meta'
import { constellationIcons } from './talent-icons'
import { ELEMENT_FILL } from './tokens'

/**
 * The six constellations as the game's own icons (white glyphs) in circles,
 * Enka-style: unlocked ones on the element colour, locked ones dimmed with
 * a lock. A column by default (beside splash art), `row` for a line.
 * Plain <img>s (no CSS masks), so the share card's PNG export draws them.
 */
const props = withDefaults(
  defineProps<{
    characterKey: string
    value: number
    element: Element | null
    row?: boolean
    size?: 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const icons = computed(() => constellationIcons(props.characterKey))
const level = computed(() => Math.min(6, Math.max(0, Math.trunc(props.value) || 0)))
const on = computed(() => (props.element ? ELEMENT_FILL[props.element] : 'bg-text-secondary'))
</script>

<template>
  <ol
    class="flex gap-2"
    :class="row ? 'flex-row' : 'flex-col'"
    :aria-label="`Constellation ${level} of 6`"
  >
    <li
      v-for="(src, index) in icons"
      :key="index"
      class="relative flex shrink-0 items-center justify-center rounded-full shadow-sm"
      :class="[size === 'lg' ? 'size-11' : 'size-9', index < level ? on : 'bg-text-muted/45']"
      :title="`C${index + 1}${index < level ? '' : ' · locked'}`"
    >
      <img
        v-if="src"
        :src="src"
        alt=""
        class="pointer-events-none"
        :class="[size === 'lg' ? 'size-8' : 'size-6', index < level ? '' : 'opacity-40']"
      />
      <span v-else class="font-mono text-xs font-semibold text-surface-raised"
        >C{{ index + 1 }}</span
      >
      <Lock
        v-if="index >= level"
        class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-surface-raised p-0.5 text-text-muted"
        aria-hidden="true"
      />
      <span class="sr-only">C{{ index + 1 }} {{ index < level ? 'unlocked' : 'locked' }}</span>
    </li>
  </ol>
</template>
