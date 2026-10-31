/**
 * When each alert falls (docs/plans/capture-link.md), pure: the facts of one
 * account, as the writes that change them told the hub, and one device's
 * alert settings give the alerts that device is due and when. The hub
 * (services/live.ts) keeps the facts, sets its alarm at the earliest alert
 * and sends the ones due.
 *
 * Resin follows the Planner's resin tracker (src/components/planner/resin.ts):
 * the newest reading, the capture's or one set by hand, one more every 8
 * minutes up to 200. The day turns at 04:00 server time, the month on the
 * 1st at 04:00; reminders fall at a fixed hour of the device's own time zone.
 */

import { RESET_HOUR, SERVER_UTC_OFFSET } from '@gdt/game-data/planner-math'
import type { DeviceAlerts, GiPlayer, GiTasks, PushMessage } from '@gdt/shared'
import TEXT from './alert-text.json'

export const RESIN_MAX = 200
export const RESIN_STEP_MS = 8 * 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** An alert later than this after its time is dropped (the hub was asleep, or facts came late). */
export const STALE_MS = 20 * 60_000

/** A resin count at a time (ms), regenerating from there. */
export interface Reading {
  value: number
  at: number
}

/** What alerts are worked out from, for one account. Each part is as of its own `at` (ms). */
export interface AccountFacts {
  name: string | null
  uid: string | null
  server: string | null
  /** The capture's resin (its clock or a count read later). */
  resin?: Reading
  /** The resin clock the last capture had (unix s), for placing later counts on its grid. */
  clock?: { value: number; nextAt: number }
  /** Resin set by hand on the website (account setting `resin`). */
  manual?: Reading | null
  /** When each expedition out is back (ms), as captured at `at`. */
  expeditions?: { doneAt: number[]; at: number }
  /** Welkin Moon days left at `at`. */
  welkin?: { days: number; at: number }
  commissions?: { finished: number; total: number; at: number }
  /** Paimon's Bargains as the game last showed it: `at` is when (ms). */
  bargains?: { bought: boolean; at: number }
  /** Planner tasks ticked by hand (ms). */
  ticks?: { commissions?: number; bargains?: number }
}

export type FactsUpdate = Partial<AccountFacts>

export type AlertKind =
  | 'resin'
  | 'resinFull'
  | 'expeditions'
  | 'welkin'
  | 'commissions'
  | 'bargains'

/** One alert a device is due. `key` is unique per occurrence: a sent key is never sent again. */
export interface Alert {
  kind: AlertKind
  key: string
  at: number
}

// ------------------------------------------------------------------ facts in

/** The facts after an update: each part replaced only by a newer one. */
export function mergeFacts(facts: AccountFacts | undefined, update: FactsUpdate): AccountFacts {
  const out: AccountFacts = { name: null, uid: null, server: null, ...facts }
  if (update.name !== undefined) out.name = update.name
  if (update.uid !== undefined) out.uid = update.uid
  if (update.server !== undefined) out.server = update.server
  for (const part of ['resin', 'expeditions', 'welkin', 'commissions', 'bargains'] as const) {
    const next = update[part]
    const current = out[part]
    if (next && (!current || next.at >= current.at))
      (out as unknown as Record<string, unknown>)[part] = next
  }
  if (update.clock && (!out.clock || update.clock.nextAt >= out.clock.nextAt))
    out.clock = update.clock
  // Set or cleared by hand: always the latest word.
  if (update.manual !== undefined) out.manual = update.manual
  if (update.ticks) out.ticks = { ...out.ticks, ...update.ticks }
  return out
}

/** A resin clock (`gi_tasks.resin`) as a reading: the last point landed one step before the next. */
export function clockReading(clock: { value: number; nextAt: number }): Reading {
  return { value: clock.value, at: clock.nextAt * 1000 - RESIN_STEP_MS }
}

/** A count read at `at` (ms), placed on the clock's grid when there is one. */
export function countReading(
  value: number,
  at: number,
  clock?: { nextAt: number } | null,
): Reading {
  if (!clock) return { value, at }
  const tick = clock.nextAt * 1000 - RESIN_STEP_MS
  const steps = Math.floor((at - tick) / RESIN_STEP_MS)
  return { value, at: steps >= 0 ? tick + steps * RESIN_STEP_MS : at }
}

/** The facts a snapshot tells (taken at `takenAt` ms): its `gi_player` and `gi_tasks`, normalized. */
export function snapshotFacts(
  good: { player: GiPlayer | null; tasks: GiTasks | null },
  takenAt: number,
): FactsUpdate {
  const update: FactsUpdate = {}
  const tasks = good.tasks ?? undefined
  const clock = tasks?.resin
  const count = good.player?.resin
  if (clock) {
    update.clock = clock
    const login = clockReading(clock)
    // A count read later in the session than the login's clock: that count, on the clock's grid.
    update.resin =
      count !== undefined && count !== clock.value && takenAt > login.at
        ? countReading(count, takenAt, clock)
        : login
  } else if (count !== undefined) {
    update.resin = { value: count, at: takenAt }
  }
  Object.assign(update, taskFacts(tasks, takenAt))
  return update
}

/** The parts of `gi_tasks` alerts read, as of `at` (ms). */
export function taskFacts(tasks: GiTasks | undefined, at: number): FactsUpdate {
  const update: FactsUpdate = {}
  if (!tasks) return update
  if (tasks.expeditions) {
    update.expeditions = { doneAt: tasks.expeditions.map((e) => e.doneAt * 1000), at }
  }
  if (tasks.welkin) update.welkin = { days: tasks.welkin.days, at }
  if (tasks.commissions) {
    update.commissions = {
      finished: tasks.commissions.finished,
      total: tasks.commissions.total,
      at,
    }
  }
  if (tasks.bargains) {
    update.bargains = { bought: tasks.bargains.bought, at: tasks.bargains.at * 1000 }
  }
  return update
}

/**
 * The facts a live batch tells (Leyline delta changes, built at `at` ms):
 * `gi_player.resin`, `gi_tasks.<part>`. Other paths are not about alerts.
 */
export function deltaFacts(
  changes: readonly (readonly [string, readonly (string | number)[], unknown?])[],
  at: number,
  known: Pick<AccountFacts, 'clock'> | undefined,
): FactsUpdate {
  const tasks: GiTasks = {}
  let count: number | undefined
  for (const [op, path, value] of changes) {
    if (op !== 'set' || path.length !== 2) continue
    const [root, field] = path.map(String)
    if (root === 'gi_player' && field === 'resin' && typeof value === 'number') count = value
    if (root === 'gi_tasks' && value && typeof value === 'object') {
      ;(tasks as Record<string, unknown>)[field!] = value
    }
  }
  const update = taskFacts(validTasks(tasks), at)
  const clock = validClock(tasks.resin)
  if (clock) {
    update.clock = clock
    update.resin = clockReading(clock)
  }
  if (count !== undefined && count >= 0 && count <= 2_000) {
    update.resin = countReading(count, at, clock ?? known?.clock)
  }
  return update
}

/** Only well-formed parts (the journal checked them, but alerts never trust a shape). */
function validTasks(tasks: GiTasks): GiTasks {
  const out: GiTasks = {}
  const e = tasks.expeditions
  if (Array.isArray(e) && e.every((x) => Number.isFinite(x?.doneAt))) out.expeditions = e
  const w = tasks.welkin
  if (w && Number.isInteger(w.days)) out.welkin = w
  const c = tasks.commissions
  if (c && Number.isInteger(c.finished) && Number.isInteger(c.total)) out.commissions = c
  const b = tasks.bargains
  if (b && typeof b.bought === 'boolean' && Number.isFinite(b.at)) out.bargains = b
  return out
}

function validClock(clock: unknown): { value: number; nextAt: number } | null {
  const c = clock as { value?: unknown; nextAt?: unknown } | undefined
  return c && Number.isInteger(c.value) && Number.isInteger(c.nextAt)
    ? { value: c.value as number, nextAt: c.nextAt as number }
    : null
}

// ------------------------------------------------------------------ resin

/** The reading to count from: the hand-set one when it is newer than the capture's. */
export function resinReading(facts: AccountFacts): Reading | null {
  const capture = facts.resin ?? null
  const manual = facts.manual ?? null
  if (manual && (!capture || manual.at > capture.at)) return manual
  return capture
}

export function resinAt(reading: Reading, now: number): number {
  if (reading.value >= RESIN_MAX) return reading.value
  const grown = Math.max(0, Math.floor((now - reading.at) / RESIN_STEP_MS))
  return Math.min(RESIN_MAX, reading.value + grown)
}

/** When resin reaches `amount`: null when the reading already has it or never will (above 200). */
export function reachedAt(reading: Reading, amount: number): number | null {
  if (reading.value >= amount || amount > RESIN_MAX) return null
  return reading.at + (amount - reading.value) * RESIN_STEP_MS
}

// ------------------------------------------------------------------ the game's days

function serverOffset(server: string | null): number {
  return (
    ((SERVER_UTC_OFFSET as Record<string, number>)[server ?? ''] ?? SERVER_UTC_OFFSET.ASIA) * HOUR
  )
}

/** The 04:00 reset that started the game day at `now` (ms). */
export function dayStart(now: number, server: string | null): number {
  const shift = serverOffset(server) - RESET_HOUR * HOUR
  return Math.floor((now + shift) / DAY) * DAY - shift
}

/** The month's reset (the 1st, 04:00 server time) at or before `now`, and the next. */
export function monthResets(now: number, server: string | null): { start: number; next: number } {
  const offset = serverOffset(server)
  const local = new Date(dayStart(now, server) + offset)
  const at = (year: number, month: number) => Date.UTC(year, month, 1, RESET_HOUR) - offset
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  return { start: at(y, m), next: at(y, m + 1) }
}

/** The first `hour`:00 in time zone `tz` at or after `after` (ms). */
export function nextLocalHour(after: number, hour: number, tz: string | null): number {
  const zone = validZone(tz)
  for (let day = 0; day < 3; day++) {
    const [y, m, d] = localDate(after + day * DAY, zone) as [number, number, number]
    let guess = Date.UTC(y, m - 1, d, hour)
    // Twice: the zone's offset at the guess can differ from the one at noon (DST).
    for (let i = 0; i < 2; i++) guess = Date.UTC(y, m - 1, d, hour) - zoneOffset(guess, zone)
    if (guess >= after) return guess
  }
  return after
}

const zoneCache = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let f = zoneCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    zoneCache.set(zone, f)
  }
  return f
}

function validZone(tz: string | null): string {
  if (!tz) return 'UTC'
  try {
    formatter(tz)
    return tz
  } catch {
    return 'UTC'
  }
}

function parts(at: number, zone: string): number[] {
  const p = Object.fromEntries(
    formatter(zone)
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  )
  return [p.year, p.month, p.day, p.hour, p.minute, p.second].map(Number)
}

function localDate(at: number, zone: string): number[] {
  return parts(at, zone).slice(0, 3)
}

/** The zone's offset from UTC at `at` (ms). */
function zoneOffset(at: number, zone: string): number {
  const [y, mo, d, h, mi, s] = parts(at, zone)
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, s!) - Math.floor(at / 1000) * 1000
}

// ------------------------------------------------------------------ alerts out

/**
 * The alerts a device has coming for one account: each kind's next
 * occurrence after `since` (ms), as the facts stand. Whether a reminder is
 * still wanted (commissions not done, nothing bought) is checked as of now.
 */
export function upcomingAlerts(
  facts: AccountFacts,
  alerts: DeviceAlerts,
  now: number,
  since = now - STALE_MS,
): Alert[] {
  const out: Alert[] = []
  const push = (kind: AlertKind, key: string, at: number | null) => {
    if (at !== null && at > since) out.push({ kind, key, at })
  }
  const reading = resinReading(facts)
  if (reading) {
    if (alerts.resin !== null) {
      const at = reachedAt(reading, alerts.resin)
      push('resin', `resin:${alerts.resin}:${at}`, at)
    }
    if (alerts.resinFull && alerts.resin !== RESIN_MAX) {
      const at = reachedAt(reading, RESIN_MAX)
      push('resinFull', `resinFull:${at}`, at)
    }
  }
  const expeditions = facts.expeditions
  if (alerts.expeditions && expeditions && expeditions.doneAt.length) {
    const last = Math.max(...expeditions.doneAt)
    if (last > expeditions.at) push('expeditions', `expeditions:${last}`, last)
  }
  const welkin = facts.welkin
  if (alerts.welkin && welkin && welkin.days > 0) {
    // Days left drop by one at each reset after the capture's.
    const start = dayStart(welkin.at, facts.server) + Math.max(0, welkin.days - 3) * DAY
    const at = nextLocalHour(start, 20, alerts.tz)
    if (at < start + DAY) push('welkin', `welkin:${start}`, at)
  }
  if (alerts.commissions) {
    for (const start of [dayStart(since, facts.server), dayStart(now, facts.server)]) {
      if (!commissionsDone(facts, start)) {
        const at = nextLocalHour(start, 22, alerts.tz)
        if (at < start + DAY) push('commissions', `commissions:${start}`, at)
      }
    }
  }
  if (alerts.bargains) {
    const { start, next } = monthResets(now, facts.server)
    if (!bargainsDone(facts, start)) {
      const day = dayStart(next - 3 * DAY, facts.server)
      const at = nextLocalHour(day, 20, alerts.tz)
      if (at < next) push('bargains', `bargains:${next}`, at)
    }
  }
  // One per key (the two commissions days can be the same).
  return [...new Map(out.map((a) => [a.key, a])).values()].sort((a, b) => a.at - b.at)
}

/** Today's commissions done: captured all done after today's reset, or ticked by hand since. */
export function commissionsDone(facts: AccountFacts, start: number): boolean {
  const c = facts.commissions
  if (c && c.at >= start && c.total > 0 && c.finished >= c.total) return true
  return (facts.ticks?.commissions ?? 0) >= start
}

/** Something bought at Paimon's Bargains this month (captured or ticked). */
export function bargainsDone(facts: AccountFacts, start: number): boolean {
  const b = facts.bargains
  if (b && b.at >= start && b.bought) return true
  return (facts.ticks?.bargains ?? 0) >= start
}

// ------------------------------------------------------------------ text

type Lang = keyof typeof TEXT

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''))
}

/** The site language closest to `lang` ("pt-BR" → pt, "zh-Hant" → zh-TW). */
export function alertLang(lang: string | null | undefined): Lang {
  if (!lang) return 'en'
  if (lang in TEXT) return lang as Lang
  const lower = lang.toLowerCase()
  if (lower.startsWith('zh')) {
    return /tw|hk|mo|hant/.test(lower) ? 'zh-TW' : 'zh-CN'
  }
  const base = lower.split('-')[0]!
  return base in TEXT ? (base as Lang) : 'en'
}

/** The notification for an alert, in the device's language. */
export function alertMessage(
  alert: Alert,
  facts: AccountFacts,
  options: { lang: string | null; tz: string | null; accountId: number; now: number },
): PushMessage {
  const t = TEXT[alertLang(options.lang)]
  const account = facts.name || facts.uid || ''
  const line = (detail: string) => (account ? `${account} · ${detail}` : detail)
  const tag = `${alert.kind}:${options.accountId}`
  const url = `/app/a/${options.accountId}/planner`
  switch (alert.kind) {
    case 'resin': {
      const amount = Number(alert.key.split(':')[1])
      const reading = resinReading(facts)
      const full = reading ? reachedAt(reading, RESIN_MAX) : null
      const time = full ? clockTime(full, options.tz, options.lang) : null
      return {
        title: fill(t.resinTitle, { amount }),
        body: line(time ? fill(t.fullAt, { time }) : t.full),
        tag: `resin:${options.accountId}`,
        url,
      }
    }
    case 'resinFull':
      return {
        title: fill(t.resinTitle, { amount: RESIN_MAX }),
        body: line(t.full),
        tag: `resin:${options.accountId}`,
        url,
      }
    case 'expeditions': {
      const n = facts.expeditions?.doneAt.length ?? 0
      return {
        title: t.expeditions,
        body: line(fill(t.expeditionsBack, { n, total: n })),
        tag,
        url,
      }
    }
    case 'welkin': {
      const w = facts.welkin
      const passed = w
        ? Math.round((dayStart(options.now, facts.server) - dayStart(w.at, facts.server)) / DAY)
        : 0
      const n = w ? Math.max(0, w.days - passed) : 0
      return { title: t.welkin, body: line(fill(t.welkinLeft, { n })), tag, url }
    }
    case 'commissions': {
      const c = facts.commissions
      const today = c && c.at >= dayStart(options.now, facts.server)
      return {
        title: t.commissions,
        body: line(today ? fill(t.commissionsDone, { n: c.finished, total: c.total }) : t.notDone),
        tag,
        url,
      }
    }
    case 'bargains':
      return { title: t.bargains, body: line(t.bargainsNone), tag, url }
  }
}

function clockTime(at: number, tz: string | null, lang: string | null): string {
  try {
    return new Intl.DateTimeFormat(lang ?? 'en', {
      timeZone: validZone(tz),
      hour: 'numeric',
      minute: '2-digit',
    }).format(at)
  } catch {
    return new Date(at).toISOString().slice(11, 16)
  }
}
