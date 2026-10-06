/**
 * Planner changes made elsewhere (another tab, another device), as the live
 * socket reports them: an open Planner re-reads its goals and hand edits.
 * A tab's own writes never come back here (their event names the tab).
 */

type Listener = (accountId: number) => void

const listeners = new Set<Listener>()

export function emitPlannerChange(accountId: number): void {
  for (const listener of listeners) listener(accountId)
}

/** Listens until the returned function is called. */
export function onPlannerChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
