<script setup lang="ts">
import { computed } from 'vue'
import UiSegmented, { type SegmentedOption } from '@/components/ui/UiSegmented.vue'
import { t } from '@/i18n'

export type HaveFilterValue = 'all' | 'missing' | 'have'

/** All / Missing / Have with counts, for a collection with a known total. */
const props = defineProps<{ have: number; total: number; label: string }>()
const model = defineModel<HaveFilterValue>({ required: true })

const options = computed<SegmentedOption<HaveFilterValue>[]>(() => {
  const counts = {
    all: props.total,
    missing: Math.max(0, props.total - props.have),
    have: props.have,
  }
  return (['all', 'missing', 'have'] as const).map((value) => ({
    value,
    label: t(`collections.spincrystals.filters.${value}`),
    count: counts[value],
  }))
})
</script>

<template>
  <div class="scroll-hide scroll-fade-x -mx-3 flex max-w-full overflow-x-auto px-3 sm:mx-0 sm:px-0">
    <UiSegmented v-model="model" :options="options" :label="label" />
  </div>
</template>
