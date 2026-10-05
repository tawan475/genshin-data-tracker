import { describe, expect, it } from 'vitest'
import { formatBetween, formatDate, formatDateTime, nowrap } from '@/lib/format'
import { completionText } from '../completion'

// Local times; the dates read in the runtime's locale (see format.test.ts).
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

describe('completionText', () => {
  it("gives the game's own time where it has one", () => {
    const time = at(2025, 3, 14, 16, 41)
    expect(completionText({ kind: 'exact', at: time })).toEqual({
      text: `Completed ${nowrap(formatDateTime(time))}`,
      title: 'Completion time recorded by the game, read by irminsul',
    })
  })

  it('gives the window between the capture without it and the first with it', () => {
    const since = at(2026, 10, 1, 9, 10)
    const first = at(2026, 10, 4, 16, 5)
    expect(completionText({ kind: 'seen', since, at: first })).toEqual({
      text: `Completed ${formatBetween(since, first)}`,
      title: `Done between two captures: not in the one at ${formatDateTime(since)}, in the one at ${formatDateTime(first)}`,
    })
    expect(completionText({ kind: 'seen', since, at: first }).text).toMatch(/^Completed between /)
    // Within one day: the date, then the two times.
    const morning = at(2026, 10, 4, 9, 10)
    const sameDay = completionText({ kind: 'seen', since: morning, at: first }).text
    expect(sameDay).toBe(`Completed ${formatBetween(morning, first)}`)
    expect(sameDay).toMatch(new RegExp(`^Completed ${nowrap(formatDate(first))}, between `))
  })

  it('says "by" the first capture, and has no date for hand marks', () => {
    const first = at(2026, 10, 4, 16, 5)
    expect(completionText({ kind: 'by', at: first })).toEqual({
      text: `Completed by ${nowrap(formatDate(first))}`,
      title: `Already done in your first capture (${formatDateTime(first)})`,
    })
    expect(completionText({ kind: 'marked' })).toEqual({
      text: 'Marked done by hand',
      title: 'No capture has it, so there is no date',
    })
  })

  it("prefixes a chain's tier", () => {
    expect(completionText({ kind: 'marked' }, 1).text).toBe('Tier 2 · Marked done by hand')
    const first = at(2026, 10, 4)
    expect(completionText({ kind: 'by', at: first }, 0).text).toBe(
      `Tier 1 · Completed by ${nowrap(formatDate(first))}`,
    )
  })
})
