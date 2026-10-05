<script setup lang="ts">
import UiSelect, { type SelectGroup, type SelectOption } from '@/components/ui/UiSelect.vue'
import { CHART_RANGE_GROUPS, rangeLabel, type ChartRange } from '@/data/chart-range'

/**
 * The time range of a history chart, shared by every chart: hours, days,
 * then 1y and All, in the kit's select ("30d ⌄"). `detail` is the tooltip,
 * normally the window the range covers.
 */
defineProps<{ detail?: string }>()
const model = defineModel<ChartRange>({ required: true })

type Entry = SelectOption<ChartRange> | SelectGroup<ChartRange>

const OPTIONS = CHART_RANGE_GROUPS.flatMap((group): Entry[] => {
  const options = group.ranges.map((value) => ({ value, label: rangeLabel(value) }))
  return group.label ? [{ group: group.label, options }] : options
})
</script>

<template>
  <UiSelect
    v-model="model"
    :options="OPTIONS"
    aria-label="Time range"
    :title="detail ?? 'Time range'"
    class="w-[5.75rem] shrink-0"
  />
</template>
