<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }>(), {
  tone: 'neutral',
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="
      {
        neutral: 'bg-surface-overlay text-text-secondary',
        accent: 'bg-accent/15 text-accent-text',
        success: 'bg-emerald-500/15 text-success-text',
        danger: 'bg-danger-surface text-danger-text',
        warning: 'bg-amber-500/15 text-warning-text',
      }[tone]
    "
  >
    <slot />
  </span>
</template>
