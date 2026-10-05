/**
 * One tab per browser holds the live socket: whichever holds the Web Lock
 * `name`. The browser hands the lock to the next waiting tab the moment the
 * holder closes, crashes or lets go, so another tab takes over at once.
 * Without the Web Locks API (or BroadcastChannel, which followers need to
 * hear the leader) every tab leads for itself.
 */

/**
 * Calls `lead` once this tab holds the lock (at once without locks). Returns
 * the release: it gives up the lock, or the place in the queue for it.
 */
export function requestLeadership(name: string, lead: () => void, alone = false): () => void {
  const locks = alone || typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) {
    lead()
    return () => {}
  }
  const controller = new AbortController()
  let release: (() => void) | null = null
  locks
    .request(name, { signal: controller.signal }, () => {
      if (controller.signal.aborted) return
      lead()
      return new Promise<void>((resolve) => (release = resolve))
    })
    .catch(() => {
      // Released before it was granted (AbortError).
    })
  return () => {
    controller.abort()
    release?.()
  }
}
