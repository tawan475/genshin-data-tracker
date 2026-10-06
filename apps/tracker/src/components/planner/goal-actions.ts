/**
 * What a goal's portrait does on the Farm view's cards (GoalAvatars): a tap
 * or click opens that goal's editor, a long press or right click pauses the
 * goal (it stops counting, as the eye on its card does), and favourites get
 * a ring. The Planner page provides them; elsewhere portraits are pictures.
 */

import { inject, provide, type InjectionKey, type Ref } from 'vue'

export interface GoalActions {
  /** Opens the goal's editor (`character:Key`, `custom:<id>`, `weapon:Key:Owner:<id>`, `item:Key`). */
  open(goal: string): void
  /** Stops counting the goal (with an Undo). */
  pause(goal: string): void
  /** Character keys (custom ids too) marked favourite. */
  favorites: Readonly<Ref<ReadonlySet<string>>>
  /** Custom characters' names, by id. */
  names: Readonly<Ref<ReadonlyMap<string, string>>>
}

const KEY: InjectionKey<GoalActions> = Symbol('goal-actions')

export function provideGoalActions(actions: GoalActions): void {
  provide(KEY, actions)
}

export function useGoalActions(): GoalActions | null {
  return inject(KEY, null)
}

/** How long a press must last to pause (ms), and how far it may move (px). */
export const LONG_PRESS_MS = 500
export const LONG_PRESS_SLOP = 10
/** How long after a press its finger's click and context menu are swallowed (ms). */
export const LONG_PRESS_AFTER_MS = 1000

// The few event fields used, so the helper type-checks without the DOM (its tests run in workerd).
interface PressEvent {
  pointerType: string
  clientX: number
  clientY: number
}
interface PageEvent {
  type: string
  preventDefault(): void
  stopPropagation(): void
}
interface Page {
  addEventListener(type: string, listener: (event: PageEvent) => void, capture: boolean): void
  removeEventListener(type: string, listener: (event: PageEvent) => void, capture: boolean): void
}

/**
 * The last long press, for every portrait: pausing re-renders the cards, so
 * the click (or Android's context menu) that ends the press can land on
 * another portrait, a material or nothing; whatever it lands on ignores it.
 */
let lastFired = -Infinity

/**
 * Long press on touch and right click with a mouse, as one action: a press
 * held `LONG_PRESS_MS` fires it; a context menu fires it too, unless a long
 * press just did (Android sends both). After a held press, the next click
 * and context menu anywhere on the page are swallowed for a moment (the
 * finger's release). Bind `handlers` with v-on.
 */
export function longPress(fire: () => void, now: () => number = () => performance.now()) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start: { x: number; y: number } | null = null

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    start = null
  }
  /** `held`: a press held down (its release may click whatever is under it then). */
  const trigger = (held: boolean) => {
    cancel()
    lastFired = now()
    if (held) swallowAfter(now)
    fire()
  }

  return {
    handlers: {
      pointerdown(event: PressEvent) {
        if (event.pointerType === 'mouse') return
        cancel()
        start = { x: event.clientX, y: event.clientY }
        timer = setTimeout(() => trigger(true), LONG_PRESS_MS)
      },
      pointermove(event: PressEvent) {
        if (!start) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP) cancel()
      },
      pointerup: cancel,
      pointercancel: cancel,
      pointerleave: cancel,
      contextmenu(event: Pick<PageEvent, 'preventDefault'>) {
        event.preventDefault()
        cancel()
        if (now() - lastFired < LONG_PRESS_AFTER_MS) return
        trigger(false)
      },
    },
  }
}

/** Swallows the next click and context menu on the page, for `LONG_PRESS_AFTER_MS`. */
function swallowAfter(now: () => number) {
  const page = (globalThis as { document?: Page }).document
  if (!page) return
  const until = now() + LONG_PRESS_AFTER_MS
  const swallow = (event: PageEvent) => {
    if (now() > until) return stop()
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'click') stop()
  }
  const stop = () => {
    page.removeEventListener('click', swallow, true)
    page.removeEventListener('contextmenu', swallow, true)
  }
  page.addEventListener('click', swallow, true)
  page.addEventListener('contextmenu', swallow, true)
  setTimeout(stop, LONG_PRESS_AFTER_MS)
}

/** Forget the last long press (tests). */
export function resetLongPress(): void {
  lastFired = -Infinity
}
