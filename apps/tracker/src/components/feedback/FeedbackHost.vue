<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next'
import { useFeedback, type Toast } from '@/stores/feedback'
import UiButton from '../ui/UiButton.vue'
import UiModal from '../ui/UiModal.vue'

/** Renders toasts and the confirm dialog for the whole app. */
const feedback = useFeedback()

function runAction(toast: Toast) {
  toast.action?.run()
  feedback.dismiss(toast.id)
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end"
    aria-live="polite"
  >
    <div
      v-for="toast in feedback.toasts"
      :key="toast.id"
      class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface-raised p-3 shadow-overlay"
      :class="toast.tone === 'danger' ? 'border-danger-border' : 'border-border-default'"
      :role="toast.tone === 'danger' ? 'alert' : 'status'"
      :title="toast.hint"
    >
      <CircleAlert
        v-if="toast.tone === 'danger'"
        class="mt-0.5 size-5 shrink-0 text-danger-text"
        aria-hidden="true"
      />
      <CircleCheck
        v-else-if="toast.tone === 'success'"
        class="mt-0.5 size-5 shrink-0 text-success-text"
        aria-hidden="true"
      />
      <Info v-else class="mt-0.5 size-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="font-medium">{{ toast.title }}</p>
        <p v-if="toast.detail" class="text-sm text-text-secondary">{{ toast.detail }}</p>
        <button
          v-if="toast.action"
          type="button"
          class="mt-1 text-sm font-medium text-accent-text hover:underline"
          @click="runAction(toast)"
        >
          {{ toast.action.label }}
        </button>
      </div>
      <button
        type="button"
        class="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
        aria-label="Dismiss"
        @click="feedback.dismiss(toast.id)"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>

  <UiModal
    :open="!!feedback.confirmation"
    :title="feedback.confirmation?.title ?? ''"
    @close="feedback.settle(false)"
  >
    <p class="text-text-secondary">{{ feedback.confirmation?.detail }}</p>
    <template #footer>
      <UiButton @click="feedback.settle(false)">Cancel</UiButton>
      <UiButton
        :variant="feedback.confirmation?.tone === 'danger' ? 'danger' : 'primary'"
        @click="feedback.settle(true)"
      >
        {{ feedback.confirmation?.confirmLabel }}
      </UiButton>
    </template>
  </UiModal>
</template>
