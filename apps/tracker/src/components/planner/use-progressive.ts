import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * How many items of a long list to render, growing a chunk after each
 * painted frame: a page of 100 goal cards paints its first cards at once and
 * mounts the rest over the next frames instead of in one long task (a slow
 * phone took over two seconds). `restart` drops back to the first chunk (a
 * tab shown again); later changes to a list already shown keep it whole.
 */
export function useProgressive(total: Ref<number>, first = 8, step = 8) {
  const shown = ref(Math.min(total.value, first))
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function grow() {
    frame = 0
    timer = undefined
    if (shown.value >= total.value) return
    shown.value = Math.min(total.value, shown.value + step)
    schedule()
  }
  /** The next chunk after the coming paint (a task after the frame, not inside it). */
  function schedule() {
    if (frame || timer || shown.value >= total.value) return
    frame = requestAnimationFrame(() => {
      frame = 0
      timer = setTimeout(grow, 0)
    })
  }
  function cancel() {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
    frame = 0
    timer = undefined
  }
  function restart() {
    cancel()
    shown.value = Math.min(total.value, first)
    schedule()
  }

  watch(total, (n, before) => {
    // A list that changes while whole stays whole (a new goal shows at once).
    if (before && shown.value >= before) shown.value = n
    else {
      shown.value = Math.min(n, Math.max(shown.value, first))
      schedule()
    }
  })
  schedule()
  onBeforeUnmount(cancel)
  return { shown, restart }
}
