<script setup lang="ts" generic="T extends string | number | null">
import { ChevronDown } from 'lucide-vue-next'

export interface SelectOption<V> {
  value: V
  label: string
}

/** Options under a heading (a native `<optgroup>`). */
export interface SelectGroup<V> {
  group: string
  options: SelectOption<V>[]
}

/**
 * A native select in the kit's look. Options may be grouped under headings
 * ("Hours", "Days"), mixed with plain ones. Native on purpose: keyboard,
 * type-ahead and the phone's own picker come with it.
 */
defineOptions({ inheritAttrs: false })
defineProps<{ options: (SelectOption<T> | SelectGroup<T>)[]; invalid?: boolean }>()
const model = defineModel<T>({ required: true })

const isGroup = (entry: SelectOption<T> | SelectGroup<T>): entry is SelectGroup<T> =>
  'group' in entry
</script>

<template>
  <div class="relative" :class="$attrs.class">
    <select
      v-bind="{ ...$attrs, class: undefined }"
      v-model="model"
      class="min-h-10 w-full appearance-none rounded-md border bg-surface-raised py-2 pr-9 pl-3 text-sm text-text-primary shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
      :class="invalid ? 'border-danger' : 'border-border-strong'"
    >
      <template
        v-for="entry in options"
        :key="isGroup(entry) ? `group:${entry.group}` : String(entry.value)"
      >
        <optgroup v-if="isGroup(entry)" :label="entry.group">
          <option v-for="option in entry.options" :key="String(option.value)" :value="option.value">
            {{ option.label }}
          </option>
        </optgroup>
        <option v-else :value="entry.value">{{ entry.label }}</option>
      </template>
    </select>
    <ChevronDown
      class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-muted"
      aria-hidden="true"
    />
  </div>
</template>
