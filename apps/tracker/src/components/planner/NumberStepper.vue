<script setup lang="ts">
import { ref, watch } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'

/**
 * − value + for a small whole number (a talent level, a refinement): the
 * buttons step, the field takes typing (applied as it becomes a number in
 * range, put back on leaving it otherwise), arrow keys step in the field.
 * `prefix` shows before the number ("R" for refinement).
 */
const props = withDefaults(
  defineProps<{ modelValue: number; min?: number; max?: number; label: string; prefix?: string }>(),
  { min: 1, max: 10, prefix: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const text = ref(String(props.modelValue))
watch(
  () => props.modelValue,
  (value) => (text.value = String(value)),
)

const clamp = (n: number) => Math.max(props.min, Math.min(props.max, Math.trunc(n)))

function set(n: number) {
  const value = clamp(n)
  text.value = String(value)
  if (value !== props.modelValue) emit('update:modelValue', value)
}

function onInput() {
  const n = Number(text.value.trim())
  if (text.value.trim() !== '' && Number.isInteger(n) && n >= props.min && n <= props.max) set(n)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') set(props.modelValue + 1)
  else if (event.key === 'ArrowDown') set(props.modelValue - 1)
  else return
  event.preventDefault()
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-lg border border-border-strong bg-surface-raised shadow-sm"
  >
    <button
      type="button"
      class="inline-flex size-10 items-center justify-center rounded-l-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
      :disabled="modelValue <= min"
      :aria-label="`${label}: down`"
      @click="set(modelValue - 1)"
    >
      <Minus class="size-4" aria-hidden="true" />
    </button>
    <span class="relative inline-flex items-center">
      <span
        v-if="prefix"
        class="pointer-events-none absolute left-1.5 font-mono text-sm text-text-muted"
        aria-hidden="true"
        >{{ prefix }}</span
      >
      <input
        v-model="text"
        inputmode="numeric"
        :aria-label="label"
        class="tabular h-10 border-x border-border-default bg-transparent text-center font-mono text-base font-semibold focus:ring-2 focus:ring-accent/30 focus:outline-none"
        :class="prefix ? 'w-12 pl-3' : 'w-11'"
        @input="onInput"
        @blur="text = String(modelValue)"
        @keydown="onKey"
        @focus="($event.target as HTMLInputElement).select()"
      />
    </span>
    <button
      type="button"
      class="inline-flex size-10 items-center justify-center rounded-r-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
      :disabled="modelValue >= max"
      :aria-label="`${label}: up`"
      @click="set(modelValue + 1)"
    >
      <Plus class="size-4" aria-hidden="true" />
    </button>
  </span>
</template>
