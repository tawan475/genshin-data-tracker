/**
 * Wish history changes made elsewhere (irminsul's sync, another tab), as the
 * live socket reports them: an open Wish History page re-reads the history.
 * A tab's own imports never come back here (their event names the tab).
 */

type Listener = (accountId: number) => void

const listeners = new Set<Listener>()

export function emitWishChange(accountId: number): void {
  for (const listener of listeners) listener(accountId)
}

/** Listens until the returned function is called. */
export function onWishChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
