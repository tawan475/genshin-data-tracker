<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

/**
 * A dialog on the native <dialog> element: focus trapping, Escape and the
 * top layer come from the browser. Close by setting `open` false.
 */
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

watch(
  () => props.open,
  async (open) => {
    await nextTick()
    if (!dialog.value) return
    if (open && !dialog.value.open) dialog.value.showModal()
    if (!open && dialog.value.open) dialog.value.close()
  },
  { immediate: true },
)

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[calc(100%-2rem)] rounded-2xl border border-border-default bg-surface-raised p-0 text-text-primary shadow-overlay backdrop:bg-black/60"
    :class="wide ? 'max-w-3xl' : 'max-w-lg'"
    @cancel.prevent="emit('close')"
    @click="onBackdrop"
  >
    <div class="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <h2 class="font-display text-xl font-bold">{{ title }}</h2>
      <button
        type="button"
        class="-mt-1 -mr-2 inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
        aria-label="Close"
        @click="emit('close')"
      >
        <X class="size-5" aria-hidden="true" />
      </button>
    </div>
    <div class="max-h-[70dvh] overflow-y-auto px-5 py-4">
      <slot />
    </div>
    <div
      v-if="$slots.footer"
      class="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-4"
    >
      <slot name="footer" />
    </div>
  </dialog>
</template>
