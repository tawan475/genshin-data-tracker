<script setup lang="ts">
import { LayoutGrid, Layers, Rows3 } from 'lucide-vue-next'
import type { ArtifactView } from '@/data/artifacts'

/** Cards | Table | Sets. Icons only on a phone; the name stays in the tooltip. */
const view = defineModel<ArtifactView>({ required: true })

const OPTIONS = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: Rows3 },
  { value: 'sets', label: 'Sets', icon: Layers },
] as const
</script>

<template>
  <div
    class="inline-flex shrink-0 rounded-lg bg-surface-overlay p-1"
    role="radiogroup"
    aria-label="View"
  >
    <button
      v-for="option in OPTIONS"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="view === option.value"
      :title="option.label"
      class="inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors sm:px-3"
      :class="
        view === option.value
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'
      "
      @click="view = option.value"
    >
      <component :is="option.icon" class="size-4" aria-hidden="true" />
      <span class="sr-only sm:not-sr-only">{{ option.label }}</span>
    </button>
  </div>
</template>
