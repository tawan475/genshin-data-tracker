<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

/** Icon-only control: `label` becomes the accessible name and the tooltip. */
defineProps<{ label: string; to?: RouteLocationRaw; active?: boolean }>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    :aria-label="label"
    :title="label"
    class="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
    :class="active ? 'bg-surface-overlay text-text-primary' : ''"
  >
    <slot />
  </component>
</template>
