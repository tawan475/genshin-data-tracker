import { describe, expect, it } from 'vitest'
import { createUpdateFlow, UPDATE_TIMEOUT_MS, type WaitingWorker } from '../update-flow'

/** `worker` true: a worker is waiting; false: none; 'throws': no registration. */
function setup(worker: boolean | 'throws') {
  const posted: unknown[] = []
  const timers: { fn: () => void; ms: number }[] = []
  let reloads = 0
  const waiting: WaitingWorker = { postMessage: (m) => posted.push(m) }
  const flow = createUpdateFlow({
    getWaiting: async () => {
      if (worker === 'throws') throw new Error('no registration')
      return worker ? waiting : null
    },
    reload: () => reloads++,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
  })
  return { flow, posted, timers, reloads: () => reloads }
}

describe('update flow', () => {
  it('asks the waiting worker to take over and reloads on its takeover', async () => {
    const s = setup(true)
    await s.flow.apply()
    expect(s.posted).toEqual(['SKIP_WAITING'])
    expect(s.reloads()).toBe(0)
    s.flow.controllerChanged()
    expect(s.reloads()).toBe(1)
  })

  it('reloads at once when no worker is waiting any more (another tab took it)', async () => {
    const s = setup(false)
    // Another tab's Reload switched this tab's controller before the click.
    s.flow.controllerChanged()
    expect(s.reloads()).toBe(0)
    await s.flow.apply()
    expect(s.reloads()).toBe(1)
    expect(s.timers).toEqual([])
  })

  it('reloads anyway when the takeover never arrives', async () => {
    const s = setup(true)
    await s.flow.apply()
    expect(s.timers).toHaveLength(1)
    expect(s.timers[0]!.ms).toBe(UPDATE_TIMEOUT_MS)
    s.timers[0]!.fn()
    expect(s.reloads()).toBe(1)
  })

  it('reloads only once, however the events arrive', async () => {
    const s = setup(true)
    await s.flow.apply()
    await s.flow.apply()
    s.flow.controllerChanged()
    s.flow.controllerChanged()
    s.timers.forEach((t) => t.fn())
    expect(s.posted).toEqual(['SKIP_WAITING'])
    expect(s.reloads()).toBe(1)
  })

  it('never reloads for a takeover the user did not accept (first visit)', () => {
    const s = setup(true)
    s.flow.controllerChanged()
    expect(s.reloads()).toBe(0)
  })

  it('reloads when the registration cannot be read', async () => {
    const s = setup('throws')
    await s.flow.apply()
    expect(s.reloads()).toBe(1)
  })
})
