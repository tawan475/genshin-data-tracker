<script setup lang="ts" generic="T extends string | number | null">
import { ChevronDown } from 'lucide-vue-next'

defineOptions({ inheritAttrs: false })
defineProps<{ options: { value: T; label: string }[]; invalid?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="relative" :class="$attrs.class">
    <select
      v-bind="{ ...$attrs, class: undefined }"
      v-model="model"
      class="min-h-10 w-full appearance-none rounded-md border bg-surface-raised py-2 pr-9 pl-3 text-sm text-text-primary shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
      :class="invalid ? 'border-danger' : 'border-border-strong'"
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
