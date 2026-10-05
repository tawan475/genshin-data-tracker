import { afterEach, describe, expect, it } from 'vitest'
import {
  formatBetween,
  formatCompactTick,
  formatDate,
  formatMonthDay,
  formatSignedTick,
  formatTime,
  nowrap,
  sameDay,
  setClockPreference,
  tickStep,
} from '../format'

// The runtime's own locale and time zone apply, so expectations are built
// from the single-date helpers and times are local.
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

describe('date ranges', () => {
  afterEach(() => setClockPreference(false))

  it('tells local days apart', () => {
    expect(sameDay(at(2026, 10, 4, 0, 1), at(2026, 10, 4, 23, 59))).toBe(true)
    expect(sameDay(at(2026, 10, 4, 23, 59), at(2026, 10, 5, 0, 1))).toBe(false)
    expect(formatMonthDay(at(2026, 10, 4))).not.toMatch(/2026/)
    expect(formatMonthDay(at(2026, 10, 4))).toMatch(/4/)
  })

  it('keeps a date on one line', () => {
    expect(nowrap('Oct 4, 2026, 4:05 PM')).toBe('Oct\u00a04,\u00a02026,\u00a04:05\u00a0PM')
  })

  it('names the year once when both days share it', () => {
    const from = at(2026, 10, 1)
    const to = at(2026, 10, 4)
    expect(formatBetween(from, to)).toBe(
      `between ${nowrap(formatMonthDay(from))} and ${nowrap(formatDate(to))}`,
    )
    const lastYear = at(2025, 12, 28)
    expect(formatBetween(lastYear, to)).toBe(
      `between ${nowrap(formatDate(lastYear))} and ${nowrap(formatDate(to))}`,
    )
    expect(formatBetween(lastYear, to)).toMatch(/2025.*2026/)
  })

  it('gives the times within one day, on the chosen clock', () => {
    const from = at(2026, 10, 4, 9, 10)
    const to = at(2026, 10, 4, 16, 5)
    const range = () =>
      `${nowrap(formatDate(to))}, between ${nowrap(formatTime(from))} and ${nowrap(formatTime(to))}`
    expect(formatBetween(from, to)).toBe(range())
    expect(formatBetween(from, to)).not.toMatch(/16/)
    setClockPreference(true)
    expect(formatBetween(from, to)).toBe(range())
    expect(formatBetween(from, to)).toMatch(/16.05/)
  })
})

describe('axis ticks', () => {
  it('prints as many decimals as the step between ticks needs', () => {
    // Mora over an hour: 50K steps would all read 9.1M / 9.2M with one decimal.
    expect([9_100_000, 9_150_000, 9_200_000].map((v) => formatCompactTick(v, 50_000))).toEqual([
      '9.1M',
      '9.15M',
      '9.2M',
    ])
    expect(formatCompactTick(9_125_000, 25_000)).toBe('9.125M')
    expect(formatCompactTick(9_000_000, 500_000)).toBe('9M')
    expect(formatCompactTick(32_500, 500)).toBe('32.5K')
    // Small values stay exact; no step falls back to one decimal.
    expect(formatCompactTick(9_500, 50)).toBe('9,500')
    expect(formatCompactTick(9_150_000, 0)).toBe('9.2M')
    expect(formatSignedTick(-1_250_000, 250_000)).toBe('−1.25M')
    expect(formatSignedTick(150_000, 50_000)).toBe('+150K')
    expect(tickStep([{ value: 10 }, { value: 35 }])).toBe(25)
    expect(tickStep([{ value: 10 }])).toBe(0)
  })
})
