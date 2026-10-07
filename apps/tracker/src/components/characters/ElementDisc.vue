<script setup lang="ts">
import { computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { Element } from '@/data/game-meta'

/**
 * A white game glyph (talent, constellation) on a dark translucent disc
 * with the element's ring and a soft glow, as the game and Enka draw them:
 * the same in either theme. The glyph fills about three quarters of it. `locked` dims it and adds a lock. A plain
 * <img>, no CSS mask, so the share card's PNG export draws it.
 */
const props = withDefaults(
  defineProps<{
    src: string
    element: Element | null
    size?: 'md' | 'lg' | 'xl'
    locked?: boolean
    /** Shown instead of the glyph when there is none ("C3"). */
    fallback?: string
  }>(),
  { size: 'md', fallback: '' },
)

const SIZE = { md: 'size-9', lg: 'size-12', xl: 'size-16' } as const

// Locked: a thin neutral ring. Unlocked: the element's ring and a soft glow,
// both as one box-shadow in the element's token colour (a ring utility is a
// box-shadow too, so the two can't be set apart).
const ring = computed(() =>
  props.locked ? 'ring-1 ring-border-strong/70' : props.element ? '' : 'ring-2 ring-text-muted/70',
)
const glow = computed(() => {
  if (props.locked || !props.element) return undefined
  const color = (share: number) =>
    `color-mix(in srgb, var(--element-${props.element}) ${share}%, transparent)`
  return { boxShadow: `0 0 0 2px ${color(90)}, 0 0 18px 1px ${color(55)}` }
})
</script>

<template>
  <span
    class="relative flex shrink-0 items-center justify-center rounded-full"
    :class="[SIZE[size], ring, locked ? 'bg-public-ground/55' : 'bg-public-ground/80']"
    :style="glow"
  >
    <img
      v-if="src"
      :src="src"
      alt=""
      class="pointer-events-none size-[74%]"
      :class="locked ? 'opacity-35' : ''"
    />
    <span
      v-else
      class="font-mono text-xs font-semibold text-accent-ink"
      :class="locked ? 'opacity-50' : ''"
      >{{ fallback }}</span
    >
    <Lock
      v-if="locked"
      class="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-surface-raised p-0.5 text-text-muted"
      aria-hidden="true"
    />
  </span>
</template>
