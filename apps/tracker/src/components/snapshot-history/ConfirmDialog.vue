<script setup lang="ts">
import { ref, useId } from 'vue'
import { CircleAlert } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'

/**
 * The old dashboard's confirm (swalConfirm) and typed-word prompt
 * (swalPrompt) as a UiModal, like the app's other confirms: title, text, a
 * red confirm and Cancel. `ask()` resolves true on confirm.
 */
export interface ConfirmOptions {
  title: string
  text: string
  confirmText: string
  cancelText?: string
  /** Require typing this word first (the old "Mass Deletion Warning"). */
  expect?: string
}

const open = ref(false)
const options = ref<ConfirmOptions | null>(null)
const typed = ref('')
const invalid = ref(false)
const errorId = useId()
const formId = useId()
let resolver: ((ok: boolean) => void) | null = null

function ask(next: ConfirmOptions): Promise<boolean> {
  resolver?.(false)
  options.value = next
  typed.value = ''
  invalid.value = false
  open.value = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

function settle(ok: boolean) {
  open.value = false
  const resolve = resolver
  resolver = null
  resolve?.(ok)
}

function confirm() {
  const expected = options.value?.expect
  if (expected !== undefined && typed.value !== expected) {
    invalid.value = true
    return
  }
  settle(true)
}

defineExpose({ ask })
</script>

<template>
  <UiModal :open="open" :title="options?.title ?? ''" @close="settle(false)">
    <form v-if="options" :id="formId" class="flex flex-col gap-4" @submit.prevent="confirm">
      <p class="flex items-start gap-3 text-text-secondary">
        <CircleAlert class="mt-0.5 size-5 shrink-0 text-warning-text" aria-hidden="true" />
        {{ options.text }}
      </p>
      <div v-if="options.expect !== undefined" class="flex flex-col gap-1">
        <UiInput
          v-model="typed"
          type="text"
          autocomplete="off"
          spellcheck="false"
          autofocus
          :placeholder="$t('snapshots.confirm.typePlaceholder', { word: options.expect })"
          :aria-label="$t('snapshots.confirm.typeLabel', { word: options.expect })"
          :invalid="invalid"
          :aria-describedby="invalid ? errorId : undefined"
          @input="invalid = false"
        />
        <p v-if="invalid" :id="errorId" class="text-sm text-danger-text" role="alert">
          {{ $t('snapshots.confirm.typeError', { word: options.expect }) }}
        </p>
      </div>
    </form>
    <template #footer>
      <UiButton autofocus @click="settle(false)">{{
        options?.cancelText ?? $t('snapshots.confirm.cancel')
      }}</UiButton>
      <UiButton variant="danger" type="submit" :form="formId">
        {{ options?.confirmText }}
      </UiButton>
    </template>
  </UiModal>
</template>
