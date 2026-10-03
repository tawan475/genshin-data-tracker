<script setup lang="ts">
/** Small label. Tones are for status; rarity colours come from RarityStars. */
withDefaults(defineProps<{ tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }>(), {
  tone: 'neutral',
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-sm border px-1.5 text-sm leading-6 font-medium whitespace-nowrap"
    :class="
      {
        neutral: 'border-border-default text-text-secondary',
        accent: 'border-transparent bg-accent text-accent-ink',
        success: 'border-border-default text-success-text',
        danger: 'border-danger-border bg-danger-surface text-danger-text',
        warning: 'border-border-default text-warning-text',
      }[tone]
    "
  >
    <slot />
  </span>
</template>
