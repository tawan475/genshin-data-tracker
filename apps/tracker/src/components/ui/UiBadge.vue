<script setup lang="ts">
/** A small status tag; `mono` sets numbers in tabular figures (counts, R1→R3). */
withDefaults(
  defineProps<{ tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'; mono?: boolean }>(),
  { tone: 'neutral' },
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded py-0.5 text-xs font-medium whitespace-nowrap"
    :class="[
      mono ? 'tabular px-1.5 font-mono' : 'px-2',
      {
        neutral: 'bg-surface-overlay text-text-secondary',
        accent: 'bg-accent/15 text-accent-text',
        success: 'bg-emerald-500/15 text-success-text',
        danger: 'bg-danger-surface text-danger-text',
        // A lighter tint than the others: warning-text on amber-500/15 is 4.48:1 in light.
        warning: 'bg-amber-500/10 text-warning-text',
      }[tone],
    ]"
  >
    <slot />
  </span>
</template>
