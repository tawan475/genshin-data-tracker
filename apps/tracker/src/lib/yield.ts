/**
 * Ends the current task so the browser can paint and take input before the
 * rest runs (`scheduler.yield()` where there is one, else a zero timeout):
 * for work that must stay on the main thread but would otherwise run as one
 * long freeze (decoding, then deriving, then rendering a big page).
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (typeof scheduler?.yield === 'function') return scheduler.yield()
  return new Promise((resolve) => setTimeout(resolve, 0))
}
