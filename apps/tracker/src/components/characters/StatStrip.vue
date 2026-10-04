<script setup lang="ts">
import { formatNumber } from '@/lib/format'

export interface StripItem {
  key: string
  label: string
  value: number
  /** Tooltip. */
  title?: string
  /** Tiles with a filter behind them are buttons; `pressed` shows it is on. */
  pressed?: boolean
  tone?: 'warning'
}

/**
 * The page's headline figures as small tiles (the Overview's look, one size
 * down). A tile that maps to a filter toggles it.
 */
defineProps<{ items: StripItem[] }>()
defineEmits<{ toggle: [key: string] }>()
</script>

<template>
  <!-- One row: scrolls sideways on phones, six columns from md up. -->
  <ul
    class="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 md:grid md:grid-cols-6 md:gap-3 md:overflow-visible"
  >
    <li v-for="item in items" :key="item.key" class="flex min-w-[6.5rem] flex-1 md:min-w-0">
      <component
        :is="item.pressed === undefined ? 'div' : 'button'"
        :type="item.pressed === undefined ? undefined : 'button'"
        :aria-pressed="item.pressed"
        :title="item.title"
        class="flex w-full min-w-0 flex-col gap-0.5 rounded-xl border bg-surface-raised px-3 py-2.5 text-left shadow-sm sm:px-4 sm:py-3"
        :class="
          item.pressed
            ? 'border-accent-text ring-1 ring-accent-text'
            : item.pressed === false
              ? 'border-border-default transition-colors hover:border-border-strong hover:bg-surface-overlay'
              : 'border-border-default'
        "
        @click="item.pressed !== undefined && $emit('toggle', item.key)"
      >
        <span class="truncate text-xs text-text-secondary sm:text-sm">{{ item.label }}</span>
        <span
          class="tabular truncate font-mono text-lg font-medium sm:text-xl"
          :class="item.tone === 'warning' && item.value > 0 ? 'text-warning-text' : ''"
          >{{ formatNumber(item.value) }}</span
        >
      </component>
    </li>
  </ul>
</template>
