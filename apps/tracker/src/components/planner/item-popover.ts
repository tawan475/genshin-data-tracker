/**
 * Every material icon on the Planner opens the same inventory editor
 * (ItemPopover): the page provides `open`, the icons inject it. Outside the
 * Planner nothing is provided and the icons stay plain pictures.
 */

import type { Requirement } from '@gdt/game-data/planner-math'
import { inject, provide, type InjectionKey } from 'vue'

/** The goal the icon belongs to, for "this goal needs". */
export interface ItemContext {
  label: string
  requirement: Requirement
}

export interface ItemRequest {
  key: string
  anchor: HTMLElement
  context?: ItemContext | null
  /** Opened by touch: don't focus the input (the phone keyboard would cover the sheet). */
  touch?: boolean
}

export type OpenItem = (request: ItemRequest) => void

const KEY: InjectionKey<OpenItem> = Symbol('item-popover')

export function provideItemPopover(open: OpenItem): void {
  provide(KEY, open)
}

/** The page's item editor, or null outside the Planner. */
export function useItemPopover(): OpenItem | null {
  return inject(KEY, null)
}

/** Whether a click came from a touch (pointer events tell; a keyboard click has no pointer). */
export function fromTouch(event: Event): boolean {
  return (event as PointerEvent).pointerType === 'touch'
}
