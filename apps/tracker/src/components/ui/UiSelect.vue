<script setup lang="ts" generic="T extends string | number | null">
import { ChevronDown } from 'lucide-vue-next'

/** Native select (best on mobile), styled like UiInput. */
defineProps<{ options: { value: T; label: string }[]; invalid?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="relative">
    <select
      v-model="model"
      class="min-h-11 w-full appearance-none rounded-xl border bg-surface-raised py-2 pr-10 pl-3.5 text-base text-text-primary transition-colors focus:border-accent focus:outline-none"
      :class="invalid ? 'border-danger-border' : 'border-border-default'"
    >
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <ChevronDown
      class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
      aria-hidden="true"
    />
  </div>
</template>
