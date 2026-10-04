<script setup lang="ts">
import UiStat from '@/components/ui/UiStat.vue'

export interface StripItem {
  key: string
  label: string
  value: number
  /** Tooltip. */
  title?: string
  /** Tiles with a filter behind them are buttons; `pressed` shows it is on. */
  pressed?: boolean
  tone?: 'warning'
}

/** The page's headline figures as stat tiles. A tile that maps to a filter toggles it. */
defineProps<{ items: StripItem[] }>()
defineEmits<{ toggle: [key: string] }>()
</script>

<template>
  <!-- One row: scrolls sideways on phones, six columns from md up. -->
  <ul
    class="scroll-hide scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:scroll-fade-none md:grid-cols-6 md:gap-3 md:overflow-visible md:px-0"
  >
    <li v-for="item in items" :key="item.key" class="flex min-w-[6.5rem] flex-1 md:min-w-0">
      <UiStat
        :label="item.label"
        :value="item.value"
        exact
        :hint="item.title"
        :tone="item.tone === 'warning' && item.value > 0 ? 'warning' : undefined"
        :pressed="item.pressed"
        @click="item.pressed !== undefined && $emit('toggle', item.key)"
      />
    </li>
  </ul>
</template>
