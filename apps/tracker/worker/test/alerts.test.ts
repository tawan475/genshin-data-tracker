import { DEFAULT_DEVICE_ALERTS, type DeviceAlerts } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import en from '../../src/i18n/locales/en/planner.json'
import ja from '../../src/i18n/locales/ja/planner.json'
import TEXT from '../services/alert-text.json'
import {
  RESIN_STEP_MS,
  alertLang,
  alertMessage,
  dayStart,
  deltaFacts,
  mergeFacts,
  monthResets,
  nextLocalHour,
  snapshotFacts,
  upcomingAlerts,
  type AccountFacts,
} from '../services/alerts'

const MIN = 60_000
const HOUR = 60 * MIN
/** 2026-10-31 12:00 UTC = 20:00 on the Asia server (its day began at 04:00, 20:00 UTC the day before). */
const NOW = Date.UTC(2026, 9, 31, 12)
const RESET = Date.UTC(2026, 9, 30, 20)

const base: AccountFacts = { name: 'Main', uid: '812345678', server: 'ASIA' }
const device = (over: Partial<DeviceAlerts> = {}): DeviceAlerts => ({
  ...DEFAULT_DEVICE_ALERTS,
  resinFull: false,
  tz: 'Asia/Bangkok',
  ...over,
})

describe('alert facts', () => {
  it('reads a capture: its resin clock, or a count read later in the session on its grid', () => {
    const nextAt = NOW / 1000 + 5 * 60
    const login = snapshotFacts(
      { player: { resin: 50 } as never, tasks: { resin: { value: 50, nextAt } } },
      NOW,
    )
    expect(login.resin).toEqual({ value: 50, at: nextAt * 1000 - RESIN_STEP_MS })
    // 30 minutes later the session read 10 (spent 40): on the clock's grid.
    const later = snapshotFacts(
      { player: { resin: 10 } as never, tasks: { resin: { value: 50, nextAt } } },
      NOW + 30 * MIN,
    )
    const tick = nextAt * 1000 - RESIN_STEP_MS
    expect(later.resin).toEqual({ value: 10, at: tick + 4 * RESIN_STEP_MS })
    // Without a clock (an older Capture): the count at the capture's time.
    expect(snapshotFacts({ player: { resin: 70 } as never, tasks: null }, NOW).resin).toEqual({
      value: 70,
      at: NOW,
    })
  })

  it('reads a live batch: resin spent, the clock and task parts', () => {
    const clock = { value: 120, nextAt: NOW / 1000 + 60 }
    const update = deltaFacts(
      [
        ['set', ['gi_player', 'resin'], 80],
        ['set', ['gi_tasks', 'welkin'], { days: 12 }],
        ['set', ['materials', 'Mora'], 5],
        ['del', ['gi_tasks', 'abyss']],
      ],
      NOW + 20 * MIN,
      { clock },
    )
    const tick = clock.nextAt * 1000 - RESIN_STEP_MS
    expect(update.resin).toEqual({ value: 80, at: tick + 3 * RESIN_STEP_MS })
    expect(update.welkin).toEqual({ days: 12, at: NOW + 20 * MIN })
    expect(update.clock).toBeUndefined()
    // A bad part is not believed.
    expect(deltaFacts([['set', ['gi_tasks', 'welkin'], { days: 'x' }]], NOW, undefined)).toEqual({})
  })

  it('keeps the newer of each part', () => {
    const facts = mergeFacts(base, { resin: { value: 100, at: NOW }, welkin: { days: 9, at: NOW } })
    const merged = mergeFacts(facts, {
      resin: { value: 10, at: NOW - HOUR },
      welkin: { days: 8, at: NOW + HOUR },
      ticks: { commissions: NOW },
    })
    expect(merged.resin).toEqual({ value: 100, at: NOW })
    expect(merged.welkin).toEqual({ days: 8, at: NOW + HOUR })
    expect(merged.ticks).toEqual({ commissions: NOW })
    expect(mergeFacts(merged, { manual: null }).manual).toBeNull()
  })
})

describe('the game day and local hours', () => {
  it('turns the day at 04:00 server time and the month on the 1st', () => {
    expect(dayStart(NOW, 'ASIA')).toBe(RESET)
    expect(dayStart(RESET - 1, 'ASIA')).toBe(RESET - 24 * HOUR)
    expect(dayStart(NOW, 'AMERICA')).toBe(Date.UTC(2026, 9, 31, 9))
    expect(monthResets(NOW, 'ASIA')).toEqual({
      start: Date.UTC(2026, 8, 30, 20),
      next: Date.UTC(2026, 9, 31, 20),
    })
  })

  it('finds the next hour of a time zone, across a DST change', () => {
    // 22:00 in Bangkok (UTC+7) = 15:00 UTC.
    expect(nextLocalHour(NOW, 22, 'Asia/Bangkok')).toBe(Date.UTC(2026, 9, 31, 15))
    expect(nextLocalHour(Date.UTC(2026, 9, 31, 16), 22, 'Asia/Bangkok')).toBe(
      Date.UTC(2026, 10, 1, 15),
    )
    // New York leaves DST on 2026-11-01: 20:00 that evening is EST, 01:00 UTC.
    expect(nextLocalHour(Date.UTC(2026, 10, 1, 12), 20, 'America/New_York')).toBe(
      Date.UTC(2026, 10, 2, 1),
    )
    expect(nextLocalHour(NOW, 20, null)).toBe(Date.UTC(2026, 9, 31, 20))
    expect(nextLocalHour(NOW, 20, 'Not/AZone')).toBe(Date.UTC(2026, 9, 31, 20))
  })
})

describe('upcoming alerts', () => {
  const resin = mergeFacts(base, { resin: { value: 100, at: NOW } })

  it('resin at an amount and full', () => {
    const list = upcomingAlerts(resin, device({ resin: 160, resinFull: true }), NOW)
    expect(list.map((a) => [a.kind, a.at])).toEqual([
      ['resin', NOW + 60 * RESIN_STEP_MS],
      ['resinFull', NOW + 100 * RESIN_STEP_MS],
    ])
    // A newer hand-set value wins; one already past the amount has nothing to wait for.
    const manual = mergeFacts(resin, { manual: { value: 180, at: NOW + MIN } })
    expect(upcomingAlerts(manual, device({ resin: 160 }), NOW + MIN)).toEqual([])
    // An amount of 200 is the full alert already: one alert, not two.
    expect(upcomingAlerts(resin, device({ resin: 200, resinFull: true }), NOW)).toHaveLength(1)
  })

  it('expeditions when the last one is back', () => {
    const facts = mergeFacts(base, {
      expeditions: { doneAt: [NOW + HOUR, NOW + 3 * HOUR], at: NOW },
    })
    expect(upcomingAlerts(facts, device({ expeditions: true }), NOW)).toEqual([
      { kind: 'expeditions', key: `expeditions:${NOW + 3 * HOUR}`, at: NOW + 3 * HOUR },
    ])
  })

  it('Welkin at 20:00 on the first day with 3 days left', () => {
    const facts = mergeFacts(base, { welkin: { days: 5, at: NOW } })
    const [alert] = upcomingAlerts(facts, device({ welkin: true }), NOW)
    // Today 5, tomorrow 4, the day after 3: 20:00 Bangkok that day.
    expect(alert!.at).toBe(Date.UTC(2026, 10, 2, 13))
    expect(
      upcomingAlerts(
        mergeFacts(base, { welkin: { days: 0, at: NOW } }),
        device({ welkin: true }),
        NOW,
      ),
    ).toEqual([])
  })

  it('commissions at 22:00 unless captured done or ticked today', () => {
    const at = Date.UTC(2026, 9, 31, 15)
    expect(upcomingAlerts(base, device({ commissions: true }), NOW)).toEqual([
      { kind: 'commissions', key: `commissions:${RESET}`, at },
    ])
    const done = mergeFacts(base, { commissions: { finished: 4, total: 4, at: NOW } })
    expect(upcomingAlerts(done, device({ commissions: true }), NOW)).toEqual([])
    // Done yesterday is not done today.
    const yesterday = mergeFacts(base, { commissions: { finished: 4, total: 4, at: RESET - MIN } })
    expect(upcomingAlerts(yesterday, device({ commissions: true }), NOW)).toHaveLength(1)
    const ticked = mergeFacts(base, { ticks: { commissions: RESET + HOUR } })
    expect(upcomingAlerts(ticked, device({ commissions: true }), NOW)).toEqual([])
  })

  it('Bargains three days before the month turns, unless something was bought', () => {
    const facts = mergeFacts(base, { bargains: { bought: false, at: NOW - HOUR } })
    // November: the month turns on 2026-12-01 04:00 server time; 3 days before is the 28th.
    const now = Date.UTC(2026, 10, 10)
    expect(upcomingAlerts(facts, device({ bargains: true }), now)).toEqual([
      {
        kind: 'bargains',
        key: `bargains:${Date.UTC(2026, 10, 30, 20)}`,
        at: Date.UTC(2026, 10, 28, 13),
      },
    ])
    const bought = mergeFacts(base, { bargains: { bought: true, at: now - HOUR } })
    expect(upcomingAlerts(bought, device({ bargains: true }), now)).toEqual([])
  })

  it('drops what is long past', () => {
    const old = mergeFacts(base, { resin: { value: 100, at: NOW - 10 * HOUR } })
    expect(upcomingAlerts(old, device({ resin: 160 }), NOW)).toEqual([])
  })
})

describe('alert text', () => {
  it('is the site translations, word for word', () => {
    const pick = (d: typeof en) => ({
      resinTitle: d.resin.alertTitle,
      expeditions: d.task.builtin.expeditions,
      bargainsNone: d.tasks.capture.bargainsNone,
    })
    expect(pick(en)).toEqual({
      resinTitle: TEXT.en.resinTitle,
      expeditions: TEXT.en.expeditions,
      bargainsNone: TEXT.en.bargainsNone,
    })
    expect(pick(ja as typeof en)).toEqual({
      resinTitle: TEXT.ja.resinTitle,
      expeditions: TEXT.ja.expeditions,
      bargainsNone: TEXT.ja.bargainsNone,
    })
    expect(Object.keys(TEXT)).toHaveLength(15)
  })

  it('picks the closest language and writes the message', () => {
    expect(alertLang('pt-BR')).toBe('pt')
    expect(alertLang('zh-Hant-HK')).toBe('zh-TW')
    expect(alertLang('zh')).toBe('zh-CN')
    expect(alertLang('xx')).toBe('en')
    const facts = mergeFacts(base, { resin: { value: 100, at: NOW } })
    const [alert] = upcomingAlerts(facts, device({ resin: 160 }), NOW)
    const message = alertMessage(alert!, facts, {
      lang: 'en',
      tz: 'UTC',
      accountId: 7,
      now: alert!.at,
    })
    expect(message.title).toBe('Original Resin 160')
    expect(message.body).toMatch(/^Main · Full at /)
    expect(message.tag).toBe('resin:7')
    expect(message.url).toBe('/app/a/7/planner')
  })
})
