<script setup lang="ts">
import { computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import type { Element } from '@/data/game-meta'
import FadeImage from './FadeImage.vue'

/**
 * A white game glyph (talent, constellation) on a dark translucent disc with
 * the element's ring inside its edge and a soft glow in the element's
 * colour, as the game and Enka draw them; the same in either theme. The
 * glyph fills 88 % of the disc (the game's icons carry their own margin),
 * or `glyph` px.
 * `locked` dims it, rings it
 * thinly in grey and adds a lock. `px` sets any size (the share card's 84
 * and 112); `--disc-bg` / `--disc-glow` on an ancestor restyle the disc (the
 * share card's light theme). A plain <img> (FadeImage: a new one per src,
 * shown once loaded, never the last character's), no CSS mask, so the
 * card's PNG export draws it.
 */
const props = withDefaults(
  defineProps<{
    src: string
    element: Element | null
    size?: 'md' | 'lg' | 'xl'
    /** Diameter in px; overrides `size`. */
    px?: number
    /** Glyph size in px (default 88 % of the disc). */
    glyph?: number
    locked?: boolean
    /** Shown instead of the glyph when there is none ("C3"). */
    fallback?: string
  }>(),
  { size: 'md', px: undefined, glyph: undefined, fallback: '' },
)

const SIZE_PX = { md: 36, lg: 48, xl: 64 } as const

const diameter = computed(() => props.px ?? SIZE_PX[props.size])
const style = computed(() => {
  const d = diameter.value
  const ringWidth = d >= 64 ? 3 : 2
  const color = props.element ? `var(--element-${props.element})` : 'var(--text-muted)'
  const glow = `var(--disc-glow, 0 0 ${Math.round(d / 5)}px color-mix(in srgb, ${color} 30%, transparent))`
  return {
    width: `${d}px`,
    height: `${d}px`,
    background: 'var(--disc-bg, rgba(10, 14, 26, 0.78))',
    boxShadow: props.locked
      ? `inset 0 0 0 1px rgba(148, 163, 184, 0.45)`
      : `inset 0 0 0 ${ringWidth}px ${color}, ${glow}`,
  }
})
const lock = computed(() => `${Math.max(14, Math.round(diameter.value * 0.3))}px`)
</script>

<template>
  <span class="relative flex shrink-0 items-center justify-center rounded-full" :style="style">
    <span
      v-if="src"
      class="pointer-events-none flex items-center justify-center"
      :class="[glyph ? '' : 'size-[88%]', locked ? 'opacity-35' : '']"
      :style="glyph ? { width: `${glyph}px`, height: `${glyph}px` } : undefined"
    >
      <FadeImage :src="src" class="size-full" />
    </span>
    <span
      v-else
      class="font-mono text-xs font-semibold text-accent-ink"
      :class="locked ? 'opacity-50' : ''"
      >{{ fallback }}</span
    >
    <Lock
      v-if="locked"
      class="absolute -right-0.5 -bottom-0.5 rounded-full bg-surface-raised p-[3px] text-text-muted"
      :style="{ width: lock, height: lock }"
      aria-hidden="true"
    />
  </span>
</template>
