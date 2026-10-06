import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS, longPress, resetLongPress } from '../goal-actions'

const pointer = (pointerType: string, x = 0, y = 0) => ({ pointerType, clientX: x, clientY: y })
const menu = () => ({ preventDefault: vi.fn() })

describe('long press', () => {
  let clock = 0
  const now = () => clock

  beforeEach(() => {
    vi.useFakeTimers()
    clock = 0
    resetLongPress()
  })
  afterEach(() => vi.useRealTimers())

  const advance = (ms: number) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }

  it('fires once when a touch is held, not again on the context menu Android sends', () => {
    const fire = vi.fn()
    const { handlers } = longPress(fire, now)
    handlers.pointerdown(pointer('touch'))
    advance(LONG_PRESS_MS - 1)
    expect(fire).not.toHaveBeenCalled()
    advance(1)
    expect(fire).toHaveBeenCalledTimes(1)
    const event = menu()
    handlers.contextmenu(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('ignores a short tap and a press that moves', () => {
    const fire = vi.fn()
    const { handlers } = longPress(fire, now)
    handlers.pointerdown(pointer('touch'))
    advance(200)
    handlers.pointerup()
    advance(LONG_PRESS_MS)
    handlers.pointerdown(pointer('touch', 0, 0))
    handlers.pointermove(pointer('touch', 4, 4))
    handlers.pointermove(pointer('touch', 12, 0))
    advance(LONG_PRESS_MS)
    expect(fire).not.toHaveBeenCalled()
  })

  it('fires on a right click, and the mouse never starts a press', () => {
    const fire = vi.fn()
    const { handlers } = longPress(fire, now)
    handlers.pointerdown(pointer('mouse'))
    advance(LONG_PRESS_MS * 2)
    expect(fire).not.toHaveBeenCalled()
    handlers.contextmenu(menu())
    expect(fire).toHaveBeenCalledTimes(1)
    // Another right click a while later pauses another goal.
    advance(2000)
    handlers.contextmenu(menu())
    expect(fire).toHaveBeenCalledTimes(2)
  })

  it('swallows a context menu landing on another portrait right after a press', () => {
    const first = vi.fn()
    const second = vi.fn()
    const a = longPress(first, now)
    const b = longPress(second, now)
    a.handlers.pointerdown(pointer('touch'))
    advance(LONG_PRESS_MS)
    // The cards re-rendered: Android's context menu reaches the portrait now under the finger.
    b.handlers.contextmenu(menu())
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })
})
