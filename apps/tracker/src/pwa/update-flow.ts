/**
 * The "new version" banner's Reload, kept free of browser globals so it can be tested.
 *
 * Reload must always end in exactly one reload. Waiting only for
 * `controllerchange` after posting SKIP_WAITING left the banner stuck when the
 * worker the banner was offered for was no longer waiting: another tab had
 * already switched to it (its takeover fired this tab's `controllerchange`
 * before Reload was clicked, so nothing listened for it), or a newer build had
 * replaced it. So the click asks the registration for the worker waiting *now*,
 * reloads at once when there is none, and reloads anyway when the takeover
 * doesn't arrive within `timeoutMs`.
 */

export interface WaitingWorker {
  postMessage(message: unknown): void
}

export interface UpdateFlowDeps {
  /** The registration's worker waiting right now (null when none). */
  getWaiting: () => Promise<WaitingWorker | null>
  reload: () => void
  setTimer: (fn: () => void, ms: number) => unknown
  timeoutMs?: number
}

export const UPDATE_TIMEOUT_MS = 3000

export function createUpdateFlow(deps: UpdateFlowDeps) {
  const timeoutMs = deps.timeoutMs ?? UPDATE_TIMEOUT_MS
  let accepted = false
  let reloading = false

  const reloadOnce = () => {
    if (reloading) return
    reloading = true
    deps.reload()
  }

  return {
    /** The Reload click. */
    async apply(): Promise<void> {
      if (accepted) return
      accepted = true
      let waiting: WaitingWorker | null = null
      try {
        waiting = await deps.getWaiting()
      } catch {
        // No registration to ask: a plain reload still loads the newest page.
      }
      if (!waiting) return reloadOnce()
      waiting.postMessage('SKIP_WAITING')
      deps.setTimer(reloadOnce, timeoutMs)
    },
    /**
     * A new worker took over this page. Only an update the user accepted
     * reloads: a first visit also fires this (the worker claims the page), and
     * so does another tab's Reload, after which this tab keeps its banner.
     */
    controllerChanged(): void {
      if (accepted) reloadOnce()
    },
  }
}
