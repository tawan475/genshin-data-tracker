<script setup lang="ts">
/**
 * The old table's checkbox: an indigo box with a tick (a dash when only part
 * is selected). The root is the hit area; size it from the parent. Emits the
 * event so the parent can read `shiftKey`.
 */
defineProps<{
  checked: boolean
  mixed?: boolean
  label: string
}>()
const emit = defineEmits<{ toggle: [event: MouseEvent | KeyboardEvent] }>()

/** Shift-click would otherwise select the text between the two rows. */
function onMouseDown(event: MouseEvent) {
  if (event.shiftKey) event.preventDefault()
}
</script>

<template>
  <div
    class="flex cursor-pointer items-center justify-center rounded-md select-none outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
    role="checkbox"
    :aria-checked="mixed ? 'mixed' : checked"
    :aria-label="label"
    tabindex="0"
    @mousedown="onMouseDown"
    @click="emit('toggle', $event)"
    @keydown.space.prevent="emit('toggle', $event)"
  >
    <div
      class="flex size-4 items-center justify-center rounded border transition-colors"
      :class="
        checked || mixed
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-border-strong bg-surface-raised text-transparent'
      "
    >
      <svg class="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path v-if="mixed && !checked" stroke-linecap="round" stroke-width="3" d="M6 12h12"></path>
        <path
          v-else
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="3"
          d="M5 13l4 4L19 7"
        ></path>
      </svg>
    </div>
  </div>
</template>
