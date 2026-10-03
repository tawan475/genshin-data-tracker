<script setup lang="ts" generic="T extends string">
import { useId } from 'vue'

/**
 * Mutually exclusive options as native radios (arrow keys work), styled as
 * a segmented control with 44px targets.
 */
defineProps<{ label: string; options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
const name = useId()
</script>

<template>
  <fieldset class="min-w-0">
    <legend class="mb-1.5 text-sm font-medium text-text-secondary">{{ label }}</legend>
    <div
      class="inline-flex flex-wrap rounded-xl border border-border-default bg-surface-sunken p-0.5"
    >
      <label v-for="option in options" :key="option.value" class="relative cursor-pointer">
        <input
          v-model="model"
          type="radio"
          :name="name"
          :value="option.value"
          class="peer sr-only"
        />
        <span
          class="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-text-secondary transition-colors peer-checked:bg-surface-raised peer-checked:text-text-primary peer-checked:shadow-card peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring hover:text-text-primary"
        >
          {{ option.label }}
        </span>
      </label>
    </div>
  </fieldset>
</template>
