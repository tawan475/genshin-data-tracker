import { describe, expect, it } from 'vitest'
import { parseWishTime } from '@gdt/shared'
import { monthName, runDates, wishDay, wishShortTime } from '@/components/wishes/wish-labels'
import { locale } from '@/i18n/locale'
import type { BannerRun } from '../wish-history'

const at = (text: string) => parseWishTime(text)!

describe('wish labels', () => {
  it('writes days without this year and with another', () => {
    expect(wishDay(at('2026-10-03 13:34:00'), 2026)).toBe('Oct 3')
    expect(wishDay(at('2024-01-31 23:59:00'), 2026)).toBe('Jan 31, 2024')
    expect(wishShortTime(at('2026-10-03 13:34:56'), 2026)).toBe('Oct 3, 13:34')
    expect(monthName('2021-01')).toBe('Jan 2021')
  })

  it('writes days in the language on screen through Intl (Russian months after a day)', () => {
    locale.value = 'ru'
    try {
      expect(wishDay(at('2026-05-12 13:34:00'), 2026)).toBe('12 мая')
      expect(wishDay(at('2024-05-12 13:34:00'), 2026)).toMatch(/^12 мая 2024/)
    } finally {
      locale.value = 'en'
    }
  })

  it("dates a banner run on the data's clock", () => {
    // Banner times are UTC; the data's clock is UTC+8.
    const run = (start: string, end: string): BannerRun => ({
      banner: {
        kind: 'character',
        start: at(start) - 8 * 3600,
        end: at(end) - 8 * 3600,
        featured5: [],
        featured4: [],
        version: '9.9',
        name: 'Test',
        name400: '',
      },
      pulls: 1,
      fives: [],
    })
    expect(runDates(run('2026-08-12 06:00:00', '2026-09-02 17:59:59'), false, 2026)).toBe(
      'Aug 12 – Sep 2',
    )
    expect(runDates(run('2024-07-01 06:00:00', '2024-07-21 17:59:59'), false, 2026)).toBe(
      'Jul 1 – Jul 21, 2024',
    )
    expect(runDates(run('2025-12-20 06:00:00', '2026-01-09 17:59:59'), false, 2026)).toBe(
      'Dec 20, 2025 – Jan 9',
    )
    expect(runDates(run('2026-09-23 06:00:00', '2026-10-14 17:59:59'), true, 2026)).toBe(
      'Sep 23 – now',
    )
  })
})
