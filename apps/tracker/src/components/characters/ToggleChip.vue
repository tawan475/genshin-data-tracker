<script setup lang="ts">
import { Check } from 'lucide-vue-next'

/** An on/off filter in a toolbar: a pressed button with a check when on. */
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    :aria-pressed="model"
    class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap transition-colors"
    :class="
      model
        ? 'border-border-strong bg-surface-overlay text-text-primary'
        : 'border-border-default bg-surface-raised text-text-secondary hover:text-text-primary'
    "
    @click="model = !model"
  >
    <Check v-if="model" class="size-4" aria-hidden="true" />
    <slot />
  </button>
</template>
