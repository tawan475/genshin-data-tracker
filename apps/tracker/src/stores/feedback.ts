import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  tone: 'info' | 'success' | 'danger'
  title: string
  detail?: string
  action?: { label: string; run: () => void }
}

export interface ConfirmRequest {
  title: string
  /** What is lost and where, in plain words (not "this cannot be undone"). */
  detail: string
  confirmLabel: string
  tone?: 'danger' | 'default'
  resolve: (ok: boolean) => void
}

/** Toasts and confirm dialogs, rendered once by the app shell. */
export const useFeedback = defineStore('feedback', () => {
  const toasts = ref<Toast[]>([])
  const confirmation = ref<ConfirmRequest | null>(null)
  let nextId = 1

  function toast(input: Omit<Toast, 'id'>, ms = input.tone === 'danger' ? 8000 : 4500) {
    const id = nextId++
    toasts.value.push({ ...input, id })
    if (ms > 0) setTimeout(() => dismiss(id), ms)
    return id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /** Shows an error from any thrown value; ApiRequestError messages are safe to show. */
  function error(title: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : undefined
    return toast({ tone: 'danger', title, detail })
  }

  function confirm(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    confirmation.value?.resolve(false)
    return new Promise((resolve) => {
      confirmation.value = { ...request, resolve }
    })
  }

  function settle(ok: boolean) {
    confirmation.value?.resolve(ok)
    confirmation.value = null
  }

  return { toasts, confirmation, toast, dismiss, error, confirm, settle }
})
