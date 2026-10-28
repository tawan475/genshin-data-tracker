import { describe, expect, it } from 'vitest'
import { LIVE_MS, RECENT_MS, captureStatus } from '../capture-status'

const now = 1_800_000_000_000
const base = { latest: null, device: null, userKey: false, now }
const capture = (ago: number) => ({ lastSeenAt: now - ago, source: 'Irminsul' })

describe('captureStatus', () => {
  it('is none with no capture upload, app or key', () => {
    expect(captureStatus(base).state).toBe('none')
    // A file from elsewhere (Genshin Optimizer) is not a capture.
    expect(captureStatus({ ...base, latest: { lastSeenAt: now, source: 'GO' } }).state).toBe('none')
    expect(captureStatus({ ...base, latest: { lastSeenAt: now } }).state).toBe('none')
  })

  it('is idle while a capture app or key exists but nothing came yet', () => {
    const device = { device: 'GAMING-PC', lastSeenAt: now }
    expect(captureStatus({ ...base, device })).toEqual({
      state: 'idle',
      at: null,
      device: 'GAMING-PC',
    })
    expect(captureStatus({ ...base, userKey: true }).state).toBe('idle')
  })

  it('goes live, recent, then idle with the age of the last capture', () => {
    expect(captureStatus({ ...base, latest: capture(LIVE_MS - 1) }).state).toBe('live')
    expect(captureStatus({ ...base, latest: capture(LIVE_MS) }).state).toBe('recent')
    expect(captureStatus({ ...base, latest: capture(RECENT_MS - 1) }).state).toBe('recent')
    expect(captureStatus({ ...base, latest: capture(RECENT_MS) }).state).toBe('idle')
  })

  it('counts a live-sync change as the newest capture', () => {
    const status = captureStatus({ ...base, latest: capture(RECENT_MS * 3), liveAt: now - 5_000 })
    expect(status).toEqual({ state: 'live', at: now - 5_000, device: null })
  })
})
