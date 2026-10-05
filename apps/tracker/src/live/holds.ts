/**
 * What may hold live updates back, so data never changes under the user:
 * - an open dialog (every UiModal holds while open): a newer version of any
 *   account waits until the last dialog closes, then applies by itself; the
 *   dialog's header offers "Refresh" to take it now;
 * - this tab's own import run for an account: its updates wait for the run
 *   to end, when the import queue re-reads the account once, instead of every
 *   view re-loading its data after each uploaded file.
 * The accounts store asks `isHeld` when it folds fresh rows in and publishes
 * what waits in `pendingIds`.
 */

import { computed, onScopeDispose, reactive, shallowRef, watch } from 'vue'

const dialogs = shallowRef(0)

/** True while a dialog is open. */
export const updatesHeld = computed(() => dialogs.value > 0)

/** Accounts with an import running in this tab. */
export const importingAccounts = reactive(new Set<number>())

/** Accounts with a newer version waiting (kept by the accounts store). */
export const pendingIds = shallowRef<ReadonlySet<number>>(new Set())

/** Something waits that only a dialog holds back: what its "Refresh" would apply. */
export const updatePending = computed(() =>
  [...pendingIds.value].some((id) => !importingAccounts.has(id)),
)

/** Whether a newer version of account `id` must wait; `force` ignores dialogs. */
export function isHeld(id: number, force = false): boolean {
  return importingAccounts.has(id) || (!force && updatesHeld.value)
}

/** Holds updates while `active()` is true (and until the calling scope ends). */
export function useUpdateHold(active: () => boolean): void {
  let holding = false
  const set = (on: boolean) => {
    if (on === holding) return
    holding = on
    dialogs.value += on ? 1 : -1
  }
  watch(active, (on) => set(!!on), { immediate: true, flush: 'sync' })
  onScopeDispose(() => set(false))
}

let applier: (() => void) | null = null

/** Registers what "Refresh" in a dialog does (the live-updates loop). */
export function onApplyPending(apply: () => void): () => void {
  applier = apply
  return () => {
    if (applier === apply) applier = null
  }
}

/** Applies what waits now, dialogs or not. */
export function applyPendingNow(): void {
  applier?.()
}
