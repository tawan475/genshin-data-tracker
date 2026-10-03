<script setup lang="ts" generic="T extends string | number">
/** A small set of mutually exclusive options (e.g. day / month / year). */
defineProps<{ options: { value: T; label: string }[]; label: string }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="inline-flex rounded-lg border border-border-default bg-surface-sunken p-0.5"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="min-h-9 rounded-md px-3 text-sm font-medium transition-colors"
      :class="
        model === option.value
          ? 'bg-surface-raised text-text-primary shadow-card'
          : 'text-text-secondary hover:text-text-primary'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
