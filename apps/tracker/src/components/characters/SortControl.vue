<script setup lang="ts" generic="T extends string">
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-vue-next'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiSelect from '@/components/ui/UiSelect.vue'

/**
 * Sort key + direction. Picking a new key resets the direction to that key's
 * natural one (numbers high to low, names A to Z); the button flips it.
 */
const props = defineProps<{
  options: { value: T; label: string; natural: 'asc' | 'desc' }[]
}>()
const sort = defineModel<T>('sort', { required: true })
const direction = defineModel<'asc' | 'desc'>('direction', { required: true })

const selectOptions = props.options.map((o) => ({ value: o.value, label: o.label }))

function pick(value: T) {
  sort.value = value
  direction.value = props.options.find((o) => o.value === value)?.natural ?? 'desc'
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1">
    <label class="min-w-0 flex-1">
      <span class="sr-only">Sort</span>
      <UiSelect :model-value="sort" :options="selectOptions" @update:model-value="pick" />
    </label>
    <UiIconButton
      :label="direction === 'desc' ? 'Sort descending' : 'Sort ascending'"
      @click="direction = direction === 'desc' ? 'asc' : 'desc'"
    >
      <ArrowDownWideNarrow v-if="direction === 'desc'" class="size-5" aria-hidden="true" />
      <ArrowUpNarrowWide v-else class="size-5" aria-hidden="true" />
    </UiIconButton>
  </div>
</template>
