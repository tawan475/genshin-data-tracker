<script setup lang="ts">
import { computed } from 'vue'
import { CONSTELLATION_MAX_STYLE, isMaxConstellation } from '@/components/characters/max-badges'
import { ELEMENT_TEXT } from '@/components/characters/tokens'
import type { Element } from '@/data/game-meta'

/**
 * Constellation as in game: six four-pointed stars, filled in the element's
 * colour up to the level, outlined after it, then "C4". `size` md is 16px
 * stars (cards), lg 20px (details); "C6" is the game's gold chip
 * (characters/max-badges). The tooltip names the unlocked ones
 * when `names` (C1–C6) is given, else says "Constellation 4 of 6".
 */
const props = withDefaults(
  defineProps<{
    value: number
    element: Element | null
    size?: 'md' | 'lg'
    /** Show "C4" after the stars. */
    label?: boolean
    names?: readonly string[]
  }>(),
  { size: 'md', label: true, names: undefined },
)

const STAR =
  'M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5-.7-5.6-4.9-9.8-10.5-10.5C7.1 11.3 11.3 7.1 12 1.5Z'

const level = computed(() => Math.min(6, Math.max(0, Math.trunc(props.value) || 0)))
const on = computed(() => (props.element ? ELEMENT_TEXT[props.element] : 'text-text-secondary'))
const title = computed(() => {
  const head = `Constellation ${level.value} of 6`
  const unlocked = (props.names ?? []).slice(0, level.value)
  return unlocked.length
    ? [head, ...unlocked.map((name, i) => `C${i + 1} ${name}`)].join('\n')
    : head
})
</script>

<template>
  <span class="inline-flex items-center gap-1.5" :title="title">
    <span class="inline-flex items-center gap-0.5" role="img" :aria-label="title">
      <svg
        v-for="n in 6"
        :key="n"
        viewBox="0 0 24 24"
        class="shrink-0"
        :class="[size === 'lg' ? 'size-5' : 'size-4', n <= level ? on : 'text-text-muted/70']"
        aria-hidden="true"
      >
        <path
          :d="STAR"
          :fill="n <= level ? 'currentColor' : 'none'"
          :stroke="n <= level ? 'none' : 'currentColor'"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span
      v-if="label"
      class="tabular font-mono"
      :class="[
        size === 'lg' ? 'text-base' : 'text-sm',
        isMaxConstellation(level) ? 'rounded-full px-1.5 font-bold' : 'text-text-secondary',
      ]"
      :style="isMaxConstellation(level) ? CONSTELLATION_MAX_STYLE : undefined"
      aria-hidden="true"
      >C{{ level }}</span
    >
  </span>
</template>
