import { describe, expect, it } from 'vitest'
import { serverTiming } from '../server-timing'

describe('serverTiming', () => {
  it('reads the duration of one entry', () => {
    const header = 'bootstrap;dur=41, total;dur=57'
    expect(serverTiming(header, 'total')).toBe(57)
    expect(serverTiming(header, 'bootstrap')).toBe(41)
    expect(serverTiming('d1;desc="x";dur=3.5', 'd1')).toBe(3.5)
  })

  it('is null for a missing entry or header', () => {
    expect(serverTiming('total;dur=5', 'd1')).toBeNull()
    expect(serverTiming(null, 'total')).toBeNull()
    expect(serverTiming('total', 'total')).toBeNull()
  })
})
