/**
 * A View Transition crossfade whose own promises never reject unhandled: a
 * newer transition (a language switch right after the setting saves, a theme
 * change mid-fade) skips the running one, which rejects `ready`/`finished`
 * with an AbortError the page would otherwise log as uncaught. The update
 * itself always runs.
 */
export function quietTransition(update: () => void | Promise<void>): void {
  const transition = document.startViewTransition(update)
  transition.ready.catch(() => undefined)
  transition.finished.catch(() => undefined)
  transition.updateCallbackDone.catch(() => undefined)
}
