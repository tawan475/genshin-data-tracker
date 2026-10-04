<script setup lang="ts">
import { LayoutGrid, List } from 'lucide-vue-next'

/** Cards or a dense list. Icons only; the names are the tooltips. */
const model = defineModel<'grid' | 'list'>({ required: true })

const options = [
  { value: 'grid' as const, label: 'Cards', icon: LayoutGrid },
  { value: 'list' as const, label: 'List', icon: List },
]
</script>

<template>
  <div
    class="inline-flex shrink-0 rounded-lg border border-border-default bg-surface-overlay p-0.5"
    role="radiogroup"
    aria-label="View"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      :aria-label="option.label"
      :title="option.label"
      class="inline-flex size-9 items-center justify-center rounded-md transition-colors"
      :class="
        model === option.value
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-muted hover:text-text-primary'
      "
      @click="model = option.value"
    >
      <component :is="option.icon" class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
