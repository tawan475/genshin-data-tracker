<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import UiSpinner from './UiSpinner.vue'

/**
 * primary: the one main action on a screen (accent fill, accent-ink text).
 * secondary: everything else that is a button. ghost: low-emphasis, in toolbars.
 * danger: destructive confirmation only.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'md' | 'sm'
    type?: 'button' | 'submit'
    to?: RouteLocationRaw
    href?: string
    loading?: boolean
    disabled?: boolean
    block?: boolean
  }>(),
  { variant: 'secondary', size: 'md', type: 'button' },
)

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors select-none',
  'disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:pointer-events-none',
  props.size === 'md' ? 'min-h-11 px-4 text-base rounded-xl' : 'min-h-9 px-3 text-sm rounded-lg',
  props.block ? 'w-full' : '',
  {
    primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
    secondary:
      'border border-border-default bg-surface-raised text-text-primary hover:bg-surface-overlay',
    ghost: 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
    danger: 'bg-danger text-surface-base hover:brightness-110',
  }[props.variant],
])
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes" :aria-disabled="disabled || undefined">
    <slot />
  </RouterLink>
  <a v-else-if="href" :href="href" :class="classes" target="_blank" rel="noopener noreferrer">
    <slot />
  </a>
  <button v-else :type="type" :class="classes" :disabled="disabled || loading">
    <UiSpinner v-if="loading" class="size-4" />
    <slot />
  </button>
</template>
