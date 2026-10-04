<script setup lang="ts">
import { nextTick, ref, useId } from 'vue'
import { CircleAlert } from 'lucide-vue-next'
import BaseModal from '@/components/legacy/BaseModal.vue'

/**
 * The old dashboard's SweetAlert confirm (swalConfirm) and typed-word prompt
 * (swalPrompt) as a BaseModal: warning icon, title, text, a red confirm
 * button and a slate Cancel. `ask()` resolves true on confirm.
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
const input = ref<HTMLInputElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const titleId = useId()
const textId = useId()
let resolver: ((ok: boolean) => void) | null = null

function ask(next: ConfirmOptions): Promise<boolean> {
  resolver?.(false)
  options.value = next
  typed.value = ''
  invalid.value = false
  open.value = true
  void nextTick(() => (input.value ?? cancelButton.value)?.focus())
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
    input.value?.focus()
    return
  }
  settle(true)
}

function onModelValue(value: boolean) {
  if (!value) settle(false)
}

defineExpose({ ask })
</script>

<template>
  <BaseModal :model-value="open" @update:model-value="onModelValue">
    <div
      v-if="options"
      class="px-6 pt-8 pb-6 text-center"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="textId"
    >
      <CircleAlert
        class="mx-auto mb-4 size-20 text-amber-400 dark:text-amber-300"
        :stroke-width="1.25"
        aria-hidden="true"
      />
      <h2 :id="titleId" class="text-2xl font-semibold text-slate-700 dark:text-slate-100">
        {{ options.title }}
      </h2>
      <p :id="textId" class="mt-3 text-slate-500 dark:text-slate-400">
        {{ options.text }}
      </p>

      <div v-if="options.expect !== undefined" class="mt-5">
        <input
          ref="input"
          v-model="typed"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="`Type &quot;${options.expect}&quot; to confirm`"
          :aria-invalid="invalid || undefined"
          class="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
          @input="invalid = false"
          @keydown.enter.prevent="confirm"
        />
        <p
          v-if="invalid"
          class="mt-3 flex items-center justify-center gap-2 rounded-md bg-slate-100 dark:bg-slate-700/50 px-3 py-2 text-sm text-slate-600 dark:text-slate-300"
          role="alert"
        >
          <CircleAlert class="size-4 shrink-0 text-red-500" aria-hidden="true" />
          You must type "{{ options.expect }}"
        </p>
      </div>

      <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm bg-red-500 text-white hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
          @click="confirm"
        >
          {{ options.confirmText }}
        </button>
        <button
          ref="cancelButton"
          type="button"
          class="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm bg-slate-500 text-white hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
          @click="settle(false)"
        >
          {{ options.cancelText ?? 'Cancel' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
