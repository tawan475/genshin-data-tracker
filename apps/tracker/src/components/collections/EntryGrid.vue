<script setup lang="ts">
import GameIcon from '@/components/ui/GameIcon.vue'
import { gameIcon } from '@/lib/assets'

export interface GridEntry {
  id: number
  name: string
  /** A game image name; '' or absent for none (no picture slot then). */
  icon?: string
  /** A figure on the right (a count, "12 / 30"). */
  figure?: string
  /** A small tag under the name ("Trial", "Worn by 3"). */
  note?: string
  /** Not had: dashed and dimmed, like a missing Spincrystal. */
  missing?: boolean
  title?: string
  /** A guide to open in a new tab (the wiki's page for it). */
  href?: string
}

/**
 * A compact grid of collection entries: picture, name, a figure, a note.
 * Sized for thousands: cells never grow with their text, and off-screen
 * ones skip layout until scrolled to. An entry with `href` opens it.
 */
defineProps<{
  entries: readonly GridEntry[]
  label: string
  /** Narrowest cell. */
  min?: string
}>()
const pictured = (entry: GridEntry) => entry.icon !== undefined
</script>

<template>
  <ul
    class="grid gap-1.5"
    :style="{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min ?? '14rem'}), 1fr))` }"
    :aria-label="label"
  >
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="flex min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_2.75rem]"
    >
      <component
        :is="entry.href ? 'a' : 'div'"
        :href="entry.href"
        :target="entry.href ? '_blank' : undefined"
        :rel="entry.href ? 'noopener noreferrer' : undefined"
        class="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-sm"
        :class="[
          entry.missing
            ? 'border-dashed border-border-strong text-text-muted'
            : 'border-border-default bg-surface-sunken',
          entry.href && 'transition-colors hover:border-border-strong hover:bg-surface-overlay',
        ]"
        :title="entry.title ?? entry.name"
      >
        <GameIcon
          v-if="pictured(entry)"
          :src="entry.icon ? gameIcon(entry.icon) : ''"
          :name="entry.name"
          size="xs"
          class="shrink-0"
          :class="entry.missing && 'opacity-50 grayscale'"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span
            class="truncate"
            :class="[
              entry.name.startsWith('#') && 'tabular font-mono',
              entry.missing ? '' : 'text-text-primary',
            ]"
            >{{ entry.name }}</span
          >
          <span v-if="entry.note" class="truncate text-xs text-text-muted">{{ entry.note }}</span>
        </span>
        <span v-if="entry.figure" class="tabular shrink-0 font-mono font-medium">{{
          entry.figure
        }}</span>
      </component>
    </li>
  </ul>
</template>
