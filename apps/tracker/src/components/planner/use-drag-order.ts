import { nextTick, onBeforeUnmount, shallowRef } from 'vue'

/**
 * Reordering cards by dragging their handle, with a mouse, a finger or a
 * pen (pointer events; the handle has `touch-action: none` so a drag on it
 * doesn't scroll), and by keyboard on the focused handle (arrows move one
 * place, Home/End to the ends). Cards carry `data-goal-card="<id>"`,
 * handles `data-goal-handle="<id>"`. Near the top or bottom of the window
 * the page scrolls along. Dropping on a card moves the dragged one to its
 * place (`move(id, to)`); a key moves it by `step(id, delta)`.
 */
export function useDragOrder(handlers: {
  move: (id: string, to: string) => void
  step: (id: string, delta: number | 'start' | 'end') => void
}) {
  const dragging = shallowRef<string | null>(null)
  const over = shallowRef<string | null>(null)
  let pointer: { x: number; y: number } | null = null
  let frame = 0

  function cardAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-goal-card]')
    return el?.dataset.goalCard ?? null
  }

  /** Scrolls while the pointer rests near the window's top or bottom edge. */
  function scroll() {
    frame = 0
    if (!dragging.value || !pointer) return
    const edge = 72
    const bottom = window.innerHeight - edge - 56
    const by = pointer.y < edge ? -12 : pointer.y > bottom ? 12 : 0
    if (by !== 0) {
      window.scrollBy(0, by)
      over.value = cardAt(pointer.x, pointer.y)
    }
    frame = requestAnimationFrame(scroll)
  }

  function onMove(event: PointerEvent) {
    if (!dragging.value) return
    pointer = { x: event.clientX, y: event.clientY }
    over.value = cardAt(event.clientX, event.clientY)
    if (!frame) frame = requestAnimationFrame(scroll)
  }

  function stop(drop: boolean) {
    const id = dragging.value
    const to = over.value
    dragging.value = null
    over.value = null
    pointer = null
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onEscape, true)
    if (drop && id && to && to !== id) handlers.move(id, to)
  }
  const onUp = () => stop(true)
  const onCancel = () => stop(false)
  function onEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    stop(false)
  }

  function start(id: string, event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    dragging.value = id
    over.value = id
    pointer = { x: event.clientX, y: event.clientY }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onEscape, true)
  }

  function key(id: string, event: KeyboardEvent) {
    const by = {
      ArrowUp: -1,
      ArrowLeft: -1,
      ArrowDown: 1,
      ArrowRight: 1,
      Home: 'start' as const,
      End: 'end' as const,
    }[event.key]
    if (by === undefined) return
    event.preventDefault()
    handlers.step(id, by)
    // The card moved in the list: its handle keeps the focus.
    void nextTick(() =>
      document.querySelector<HTMLElement>(`[data-goal-handle="${CSS.escape(id)}"]`)?.focus(),
    )
  }

  onBeforeUnmount(() => stop(false))
  return { dragging, over, start, key }
}
