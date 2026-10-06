<script setup lang="ts">
import { ref, watch } from 'vue'

/**
 * One item in a bag grid, drawn as the game's inventory draws it: the
 * picture on its rarity's colour, a corner slot in each corner over it
 * (`top-left`, `top-right`, `bottom-left`, `bottom-right`), optional stars
 * along its foot and a footer line (`footer`, then `footer-end` on the
 * right). The whole tile is one button; `label` is its accessible name and
 * tooltip, so the slots stay visual. `selected` rings it in the accent.
 * Same frame as the Materials bag's tiles.
 */
const props = defineProps<{
  src: string
  name: string
  rarity?: number | null
  label: string
  stars?: boolean
  selected?: boolean
}>()
defineEmits<{ open: [] }>()

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

// Literal class names so Tailwind sees them.
const BACKDROP: Record<number, string> = {
  5: 'from-rarity-5/45 to-rarity-5/10',
  4: 'from-rarity-4/45 to-rarity-4/10',
  3: 'from-rarity-3/40 to-rarity-3/10',
  2: 'from-rarity-2/40 to-rarity-2/10',
  1: 'from-rarity-1/40 to-rarity-1/10',
}
const STAR_TEXT: Record<number, string> = {
  5: 'text-rarity-5',
  4: 'text-rarity-4',
  3: 'text-rarity-3',
  2: 'text-rarity-2',
  1: 'text-rarity-1',
}
const CORNER = 'absolute flex items-center gap-0.5'

function initials(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-label="label"
    :title="label"
    class="group flex w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-surface-raised text-left shadow-sm transition hover:-translate-y-px hover:border-accent hover:shadow-md"
    :class="selected ? 'border-accent ring-2 ring-accent' : 'border-border-default'"
    @click="$emit('open')"
  >
    <span
      class="relative block aspect-square w-full bg-linear-to-br"
      :class="rarity ? BACKDROP[rarity] : 'from-surface-overlay to-surface-sunken'"
      aria-hidden="true"
    >
      <img
        v-if="src && !failed"
        loading="lazy"
        decoding="async"
        :src="src"
        alt=""
        class="absolute inset-0 size-full object-contain p-1.5"
        @error="failed = true"
      />
      <span
        v-else
        class="absolute inset-0 flex items-center justify-center font-mono text-sm text-text-muted"
        >{{ initials(name) }}</span
      >
      <span v-if="$slots['top-left']" :class="CORNER" class="top-1 left-1 flex-col items-start">
        <slot name="top-left" />
      </span>
      <span v-if="$slots['top-right']" :class="CORNER" class="top-1 right-1">
        <slot name="top-right" />
      </span>
      <span v-if="$slots['bottom-left']" :class="CORNER" class="bottom-1 left-1">
        <slot name="bottom-left" />
      </span>
      <span v-if="$slots['bottom-right']" :class="CORNER" class="right-1 bottom-1">
        <slot name="bottom-right" />
      </span>
      <span
        v-if="stars && rarity"
        class="absolute inset-x-0 bottom-0 text-center text-[0.625rem] leading-none tracking-tighter drop-shadow-sm"
        :class="STAR_TEXT[rarity]"
        >{{ '★'.repeat(rarity) }}</span
      >
    </span>
    <span
      v-if="$slots.footer || $slots['footer-end']"
      class="flex items-center gap-1 border-t border-border-default px-1 text-xs leading-5"
      aria-hidden="true"
    >
      <span class="min-w-0 flex-1 truncate"><slot name="footer" /></span>
      <slot name="footer-end" />
    </span>
  </button>
</template>
