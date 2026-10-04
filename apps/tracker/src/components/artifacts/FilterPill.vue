<script setup lang="ts">
/**
 * An on/off filter toggle (aria-pressed). Pressed pills are the current
 * selection, so they carry the accent as an outline, never as a fill.
 */
defineProps<{ pressed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="pressed"
    class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition-colors"
    :class="
      pressed
        ? 'border-accent-text bg-surface-overlay text-accent-text'
        : 'border-border-default text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
    "
    @click="emit('toggle')"
  >
    <slot />
  </button>
</template>
