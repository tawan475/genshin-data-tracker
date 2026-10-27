<script setup lang="ts">
/**
 * A compact grid of entries named by `name` (the id, until the game data has
 * names: see data/collection-names.ts), each with an optional figure on the
 * right. Sized for thousands: cells never grow with their text.
 */
defineProps<{
  entries: readonly { id: number; name: string; figure?: string; title?: string }[]
  label: string
  /** Narrowest cell (the figure needs room). */
  min?: string
}>()
</script>

<template>
  <ul
    class="grid gap-1.5"
    :style="{
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min ?? '7.5rem'}), 1fr))`,
    }"
    :aria-label="label"
  >
    <li
      v-for="entry in entries"
      :key="entry.id"
      class="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-border-default bg-surface-sunken px-2.5 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_2.25rem]"
      :title="entry.title ?? entry.name"
    >
      <span
        class="min-w-0 truncate text-text-secondary"
        :class="entry.name.startsWith('#') && 'tabular font-mono'"
        >{{ entry.name }}</span
      >
      <span v-if="entry.figure" class="tabular shrink-0 font-mono font-medium">{{
        entry.figure
      }}</span>
    </li>
  </ul>
</template>
