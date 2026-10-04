<script setup lang="ts">
/**
 * An on/off filter (aria-pressed) with an optional count: "● Pyro 14".
 * Pressed chips carry the accent as an outline, like the Artifacts toolbar.
 * A zero count dims the chip but keeps it clickable.
 */
defineProps<{ pressed: boolean; count?: number }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    :aria-pressed="pressed"
    class="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition-colors"
    :class="[
      pressed
        ? 'border-accent-text bg-surface-overlay text-accent-text'
        : 'border-border-default bg-surface-raised text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
      count === 0 && !pressed ? 'opacity-50' : '',
    ]"
    @click="$emit('toggle')"
  >
    <slot />
    <span
      v-if="count !== undefined"
      class="tabular font-mono"
      :class="pressed ? 'text-accent-text' : 'text-text-muted'"
      >{{ count }}</span
    >
  </button>
</template>
