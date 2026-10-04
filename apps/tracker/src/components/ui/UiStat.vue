<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { formatCompact, formatNumber, formatSigned } from '@/lib/format'

/**
 * Stat tile: label, a big tabular number, and whatever goes beneath it (a
 * change, a progress bar) in the default slot. Compact values (72.2M) carry
 * the exact number in the tooltip. A tile with `pressed` is a toggle for the
 * filter it stands for; `button` makes it a plain button (e.g. to open
 * details). Slots: `icon` before the label, `media` (a game icon) on the
 * left, which also tightens the tile for narrow grids (the wallet), `value`
 * to replace the number.
 */
const props = defineProps<{
  label: string
  value?: number | string | null
  /** Exact digits instead of 72.2M. */
  exact?: boolean
  /** Signed change under the value, green up, red down. */
  delta?: number | null
  /** Tooltip for the whole tile. */
  hint?: string
  /** Appended to the value's tooltip ("from an earlier capture"). */
  detail?: string
  tone?: 'warning' | 'success'
  /** Toggle state (aria-pressed); the tile is a button when set. */
  pressed?: boolean
  button?: boolean
}>()

const interactive = computed(() => props.button || props.pressed !== undefined)
const media = !!useSlots().media
const shown = computed(() => {
  const v = props.value
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  return props.exact ? formatNumber(v) : formatCompact(v)
})
const valueTitle = computed(
  () =>
    [typeof props.value === 'number' ? formatNumber(props.value) : undefined, props.detail]
      .filter(Boolean)
      .join(' · ') || undefined,
)
const TONE = { warning: 'text-warning-text', success: 'text-success-text' } as const
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    :aria-pressed="pressed"
    :title="hint"
    class="flex w-full min-w-0 items-center gap-2.5 rounded-xl border bg-surface-raised text-left shadow-sm"
    :class="[
      media ? 'p-2.5' : 'px-3 py-2.5 sm:px-4 sm:py-3',
      pressed
        ? 'border-accent-text ring-1 ring-accent-text'
        : interactive
          ? 'border-border-default transition-colors hover:border-border-strong hover:bg-surface-overlay'
          : 'border-border-default',
    ]"
  >
    <span v-if="$slots.media" class="shrink-0"><slot name="media" /></span>
    <span class="flex min-w-0 flex-1 flex-col" :class="media ? '' : 'gap-0.5'">
      <span
        class="flex min-w-0 items-center gap-1 text-xs text-text-secondary"
        :class="media ? '' : 'sm:text-sm'"
      >
        <slot name="icon" />
        <span class="truncate">{{ label }}</span>
      </span>
      <slot name="value">
        <span
          class="tabular truncate font-mono text-lg font-medium"
          :class="[media ? 'leading-6' : 'sm:text-xl', tone ? TONE[tone] : '']"
          :title="valueTitle"
          >{{ shown }}</span
        >
      </slot>
      <span
        v-if="delta !== undefined && delta !== null"
        class="tabular font-mono text-sm"
        :class="
          delta > 0 ? 'text-success-text' : delta < 0 ? 'text-danger-text' : 'text-text-muted'
        "
        :title="formatNumber(delta)"
        >{{ formatSigned(delta) }}</span
      >
      <slot />
    </span>
  </component>
</template>
