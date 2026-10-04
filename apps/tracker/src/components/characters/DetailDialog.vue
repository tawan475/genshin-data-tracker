<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'

/**
 * A wide dialog for one item of a list (UiModal's native <dialog> approach,
 * sized for a build sheet): previous / next buttons and the arrow keys step
 * through the list without closing. Full screen on phones.
 */
const props = defineProps<{
  open: boolean
  title: string
  /** Position in the list, for "12 / 97"; omit to hide the stepper. */
  index?: number
  total?: number
}>()
const emit = defineEmits<{ close: []; step: [delta: -1 | 1] }>()
const dialog = ref<HTMLDialogElement>()
const body = ref<HTMLElement>()

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

// A new item starts at the top.
watch(
  () => props.title,
  () => body.value?.scrollTo({ top: 0 }),
)

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}

function onKey(event: KeyboardEvent) {
  if (props.index === undefined || event.altKey || event.ctrlKey || event.metaKey) return
  const target = event.target as HTMLElement | null
  if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
  if (event.key === 'ArrowLeft') emit('step', -1)
  else if (event.key === 'ArrowRight') emit('step', 1)
  else return
  event.preventDefault()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden bg-surface-raised p-0 text-text-primary shadow-overlay backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:rounded-xl sm:border sm:border-border-default"
    :aria-label="title"
    @cancel.prevent="emit('close')"
    @click="onBackdrop"
    @keydown="onKey"
  >
    <div class="flex h-full flex-col sm:max-h-[90dvh]">
      <div
        class="flex shrink-0 items-center gap-2 border-b border-border-default px-3 py-2 sm:px-5"
      >
        <slot name="heading">
          <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ title }}</h2>
        </slot>
        <template v-if="index !== undefined && total">
          <span class="tabular hidden font-mono text-sm text-text-muted sm:inline">
            {{ index + 1 }} / {{ total }}
          </span>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
            aria-label="Previous"
            title="Previous (←)"
            :disabled="total < 2"
            @click="emit('step', -1)"
          >
            <ChevronLeft class="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
            aria-label="Next"
            title="Next (→)"
            :disabled="total < 2"
            @click="emit('step', 1)"
          >
            <ChevronRight class="size-5" aria-hidden="true" />
          </button>
        </template>
        <button
          type="button"
          class="inline-flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          aria-label="Close"
          title="Close"
          @click="emit('close')"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <!-- Focused on open (not the first button), so arrow keys and scrolling work at once. -->
      <div
        ref="body"
        tabindex="-1"
        autofocus
        class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 outline-none sm:p-5"
      >
        <slot />
      </div>
    </div>
  </dialog>
</template>
