import { onBeforeUnmount } from 'vue'

/**
 * Runs work in a task of its own right after the next paint, so what is
 * already on its way to the screen shows first: a chart that measures its
 * canvas while the page mounts forces a layout of the whole page inside the
 * mount (hundreds of ms on a phone), after the paint it only lays itself out.
 * Returns a cancel.
 */
export function afterPaint(work: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(work, 0)
  })
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
}

/** `afterPaint` once the component mounts; cancelled if it unmounts first. */
export function useAfterPaint(): (work: () => void) => void {
  let cancel: (() => void) | null = null
  onBeforeUnmount(() => cancel?.())
  return (work) => {
    cancel?.()
    cancel = afterPaint(() => {
      cancel = null
      work()
    })
  }
}
