/**
 * Planner tasks, pure: the built-in ones and their resets, the player's own
 * recurring ones (Seelie's custom tasks), and what Done, snooze and Undo do.
 *
 * Server time: each server keeps a fixed UTC offset all year (no daylight
 * saving; America UTC−5, Europe UTC+1, Asia and TW/HK/MO UTC+8, the same
 * table the farm days use) and its game day turns at 04:00. Without a
 * server, the browser's own time zone with the same 04:00 turn. A *game day*
 * is the date of the day that starts at 04:00, `YYYY-MM-DD`; here it is a
 * day number (days since 1970-01-01).
 *
 * Built-in tasks and when they come back (sources in the tests' header):
 * - Daily Commissions: every day at 04:00.
 * - Trounce Domains (weekly bosses), the Battle Pass's weekly missions,
 *   reputation bounties and requests: Mondays at 04:00.
 * - Spiral Abyss: the 16th of each month at 04:00 (monthly since 4.7).
 * - Imaginarium Theater, Paimon's Bargains: the 1st of each month at 04:00.
 * - Parametric Transformer: 166 hours after it was used (a cooldown, not a
 *   reset).
 * Event schedules (Stygian Onslaught, banners, limited events) follow the
 * patch calendar, which has no official machine-readable source: not here.
 */

import { RESET_HOUR, SERVER_UTC_OFFSET } from '@gdt/game-data/planner-math'
import type { CustomTask, PlannerTask, PlannerTaskInput } from '@gdt/shared'

const HOUR = 3_600_000
const DAY = 86_400_000

// ------------------------------------------------------------- server time

/** The server's offset from UTC in hours, null for none (the browser's zone). */
export function serverOffset(server: string | null | undefined): number | null {
  return server && server in SERVER_UTC_OFFSET
    ? SERVER_UTC_OFFSET[server as keyof typeof SERVER_UTC_OFFSET]
    : null
}

/** The game day (a day number) at `now` on a server. */
export function gameDay(now: number, server: string | null | undefined): number {
  const offset = serverOffset(server)
  if (offset !== null) return Math.floor((now + (offset - RESET_HOUR) * HOUR) / DAY)
  const d = new Date(now)
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
  return d.getHours() < RESET_HOUR ? day - 1 : day
}

/** When game day `day` starts (its 04:00) on a server. */
export function dayStart(day: number, server: string | null | undefined): number {
  const offset = serverOffset(server)
  if (offset !== null) return day * DAY + (RESET_HOUR - offset) * HOUR
  const d = new Date(day * DAY)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RESET_HOUR).getTime()
}

/** `YYYY-MM-DD` of a day number. */
export function dayText(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10)
}

/** The day number of `YYYY-MM-DD`, null when it isn't one. */
export function parseDay(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return dayText(ms / DAY) === text ? ms / DAY : null
}

/** 0 = Sunday, as Date#getDay. */
export const weekdayOf = (day: number) => new Date(day * DAY).getUTCDay()

/** The day number of year `y`, month `m` (0-based, may overflow), date `d`. */
const dayOfDate = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY

/** `YYYY-MM-DD HH:mm` in server time (Seelie writes its task times so). */
export function serverClockText(ms: number, server: string | null | undefined): string {
  const offset = serverOffset(server)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (offset !== null) {
    const d = new Date(ms + offset * HOUR)
    return `${dayText(Math.floor((ms + offset * HOUR) / DAY))} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  }
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `YYYY-MM-DD[ HH:mm[:ss]]` in server time as ms, null when it isn't one. */
export function parseServerClock(text: string, server: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const offset = serverOffset(server)
  if (offset !== null) return Date.UTC(y, mo - 1, d, h, mi, s) - offset * HOUR
  return new Date(y, mo - 1, d, h, mi, s).getTime()
}

// ------------------------------------------------------------- built-in tasks

export type TaskRule =
  | { kind: 'daily' }
  /** `weekday`: 0 = Sunday, as Date#getDay. */
  | { kind: 'weekly'; weekday: number }
  /** `date`: the day of the month (1–28). */
  | { kind: 'monthly'; date: number }
  | { kind: 'cooldown'; hours: number }

export interface BuiltinTask {
  id: string
  name: string
  rule: TaskRule
  /** A task still to do turns red this long before its reset. */
  soonMs: number
  /** Seelie's key for it (`tasks[].id` in its export), when it has one. */
  seelie?: string
}

const MONDAY = 1

/** The built-in tasks, in the order the strip lists them. Ids are never reused. */
export const BUILTIN_TASKS: readonly BuiltinTask[] = [
  {
    id: 'commissions',
    name: 'Daily Commissions',
    rule: { kind: 'daily' },
    soonMs: 3 * HOUR,
    seelie: 'dt',
  },
  {
    id: 'weekly-bosses',
    name: 'Trounce Domains',
    rule: { kind: 'weekly', weekday: MONDAY },
    soonMs: DAY,
    seelie: 'trounce',
  },
  {
    id: 'battle-pass',
    name: 'Battle Pass weekly',
    rule: { kind: 'weekly', weekday: MONDAY },
    soonMs: DAY,
  },
  {
    id: 'reputation',
    name: 'Reputation',
    rule: { kind: 'weekly', weekday: MONDAY },
    soonMs: DAY,
  },
  {
    id: 'abyss',
    name: 'Spiral Abyss',
    rule: { kind: 'monthly', date: 16 },
    soonMs: 3 * DAY,
    seelie: 'abyss',
  },
  {
    id: 'theater',
    name: 'Imaginarium Theater',
    rule: { kind: 'monthly', date: 1 },
    soonMs: 3 * DAY,
    seelie: 'theater',
  },
  {
    id: 'bargains',
    name: "Paimon's Bargains",
    rule: { kind: 'monthly', date: 1 },
    soonMs: 3 * DAY,
    seelie: 'bargains',
  },
  {
    id: 'transformer',
    name: 'Parametric Transformer',
    rule: { kind: 'cooldown', hours: 166 },
    soonMs: 0,
  },
]

export const builtinTask = (id: string) => BUILTIN_TASKS.find((t) => t.id === id) ?? null

/** The first reset of a periodic rule after `now` (null for a cooldown). */
export function nextReset(rule: TaskRule, now: number, server: string | null | undefined) {
  const today = gameDay(now, server)
  if (rule.kind === 'daily') return dayStart(today + 1, server)
  if (rule.kind === 'weekly') {
    const since = (weekdayOf(today) - rule.weekday + 7) % 7
    return dayStart(today - since + 7, server)
  }
  if (rule.kind === 'monthly') {
    const d = new Date(today * DAY)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day =
      d.getUTCDate() >= rule.date ? dayOfDate(y, m + 1, rule.date) : dayOfDate(y, m, rule.date)
    return dayStart(day, server)
  }
  return null
}

/** The last reset of a periodic rule at or before `now` (null for a cooldown). */
export function lastReset(rule: TaskRule, now: number, server: string | null | undefined) {
  const today = gameDay(now, server)
  if (rule.kind === 'daily') return dayStart(today, server)
  if (rule.kind === 'weekly') {
    return dayStart(today - ((weekdayOf(today) - rule.weekday + 7) % 7), server)
  }
  if (rule.kind === 'monthly') {
    const d = new Date(today * DAY)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth()
    const day =
      d.getUTCDate() >= rule.date ? dayOfDate(y, m, rule.date) : dayOfDate(y, m - 1, rule.date)
    return dayStart(day, server)
  }
  return null
}

/** What a Done sets `next` to: the next reset, or the end of the cooldown. */
export function doneUntil(task: BuiltinTask, now: number, server: string | null | undefined) {
  const rule = task.rule
  return rule.kind === 'cooldown' ? now + rule.hours * HOUR : nextReset(rule, now, server)!
}

export interface SnoozeChoice {
  /** Days from today (the day it comes back is today + days). */
  days: number
  /** When it comes back (that day's 04:00). */
  until: number
  /** The last day before the reset. */
  last: boolean
}

/**
 * The snoozes a built-in task offers: back on a later day, before its reset
 * (a snooze past the reset would skip a period). Cooldowns snooze 1–7 days;
 * a daily task has nothing to snooze to.
 */
export function snoozeChoices(
  task: BuiltinTask,
  now: number,
  server: string | null | undefined,
): SnoozeChoice[] {
  const today = gameDay(now, server)
  const reset = nextReset(task.rule, now, server)
  const lastDay = reset === null ? today + 7 : gameDay(reset, server) - 1
  const days = new Set([1, 2, 3, 5, 7].filter((d) => today + d <= lastDay))
  if (reset !== null && lastDay > today) days.add(lastDay - today)
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => ({
      days: d,
      until: dayStart(today + d, server),
      last: reset !== null && today + d === lastDay,
    }))
}

/** Back on game day today + `days` (its 04:00). */
export function snoozeUntil(days: number, now: number, server: string | null | undefined) {
  return dayStart(gameDay(now, server) + days, server)
}

// ------------------------------------------------------------- custom tasks

/** A Done on a custom task due `due` (a day number) on `today`: the day it is due next. */
export function customDone(task: Pick<CustomTask, 'every' | 'mode'>, due: number, today: number) {
  if (today < due) return due
  if (task.mode === 'completed') return today + task.every
  return due + (Math.floor((today - due) / task.every) + 1) * task.every
}

/** Taking a Done back (Seelie's toggle): one period earlier. */
export const customUndone = (task: Pick<CustomTask, 'every'>, due: number) => due - task.every

// ------------------------------------------------------------- the list

export type TaskTone = 'soon' | 'today' | 'due' | 'rest'

export interface TaskRow {
  /** `builtin:<id>` / `custom:<id>` */
  key: string
  kind: 'builtin' | 'custom'
  id: string
  name: string
  note?: string
  /** To do now. */
  due: boolean
  /**
   * Due and close to its reset (built-in), or past its day (custom): red.
   * `today`: a custom task due today. `rest`: done or snoozed.
   */
  tone: TaskTone
  /** Built-in, due: its reset (null for a cooldown). */
  resets: number | null
  /** Resting: when it is back (ms; a custom task's day start). */
  back: number | null
  /** Resting before its reset (not Done): a snooze. */
  snoozed: boolean
  /** Custom: days past due (0 today), negative while resting. */
  late: number
  builtin: BuiltinTask | null
  custom: { task: CustomTask; due: number; position: number } | null
  /** What is stored for it (a built-in task never touched has nothing). */
  stored: PlannerTask | null
}

/**
 * The tasks to list, built-in ones first (minus the hidden), then custom
 * ones by position. `stored` is what the server has (and what waits).
 */
export function taskRows(
  stored: readonly PlannerTask[],
  now: number,
  server: string | null | undefined,
): TaskRow[] {
  const byId = new Map(stored.map((t) => [`${t.kind}:${t.id}`, t]))
  const rows: TaskRow[] = []
  for (const b of BUILTIN_TASKS) {
    const s = byId.get(`builtin:${b.id}`)
    if (s?.kind === 'builtin' && s.hidden) continue
    const next = s?.kind === 'builtin' ? (s.next ?? null) : null
    const resting = next !== null && next > now
    const resets = nextReset(b.rule, now, server)
    const due = !resting
    rows.push({
      key: `builtin:${b.id}`,
      kind: 'builtin',
      id: b.id,
      name: b.name,
      due,
      tone: !due ? 'rest' : resets !== null && resets - now <= b.soonMs ? 'soon' : 'due',
      resets: due ? resets : null,
      back: resting ? next : null,
      snoozed: resting && resets !== null && next < resets,
      late: 0,
      builtin: b,
      custom: null,
      stored: s ?? null,
    })
  }
  const today = gameDay(now, server)
  const customs = stored
    .flatMap((t, i) => (t.kind === 'custom' ? [{ t, i }] : []))
    .sort((a, b) => (a.t.position ?? a.i) - (b.t.position ?? b.i) || a.i - b.i)
  for (const { t, i } of customs) {
    const due = parseDay(t.due) ?? today
    const late = today - due
    rows.push({
      key: `custom:${t.id}`,
      kind: 'custom',
      id: t.id,
      name: t.task.name,
      note: t.task.note,
      due: late >= 0,
      tone: late > 0 ? 'soon' : late === 0 ? 'today' : 'rest',
      resets: null,
      back: late < 0 ? dayStart(due, server) : null,
      snoozed: false,
      late,
      builtin: null,
      custom: { task: t.task, due, position: t.position ?? i },
      stored: t,
    })
  }
  return rows
}

// ------------------------------------------------------------- writes

/** A row's task as it is stored (the write that puts it back). */
export function taskInput(row: TaskRow): PlannerTaskInput {
  if (row.kind === 'builtin') {
    const s = row.stored?.kind === 'builtin' ? row.stored : null
    return {
      kind: 'builtin',
      id: row.id,
      ...(s?.next !== undefined && s.next !== null ? { next: s.next } : {}),
      ...(s?.hidden ? { hidden: true } : {}),
    }
  }
  const c = row.custom!
  const s = row.stored?.kind === 'custom' ? row.stored : null
  return {
    kind: 'custom',
    id: row.id,
    task: c.task,
    due: dayText(c.due),
    ...(s?.position !== undefined ? { position: s.position } : {}),
  }
}

/** Done: a built-in task rests until its reset (or its cooldown ends), a custom one moves on. */
export function doneInput(
  row: TaskRow,
  now: number,
  server: string | null | undefined,
): PlannerTaskInput {
  const input = taskInput(row)
  if (input.kind === 'builtin') return { ...input, next: doneUntil(row.builtin!, now, server) }
  return {
    ...input,
    due: dayText(customDone(row.custom!.task, row.custom!.due, gameDay(now, server))),
  }
}

/** Taking a Done (or a snooze) back: a built-in task is due again, a custom one a period earlier. */
export function undoneInput(row: TaskRow): PlannerTaskInput {
  const input = taskInput(row)
  if (input.kind === 'builtin') {
    const { next: _, ...rest } = input
    return rest
  }
  return { ...input, due: dayText(customUndone(row.custom!.task, row.custom!.due)) }
}

/** Snoozed: back on game day today + `days`. */
export function snoozedInput(
  row: TaskRow,
  days: number,
  now: number,
  server: string | null | undefined,
): PlannerTaskInput {
  const input = taskInput(row)
  if (input.kind === 'builtin') return { ...input, next: snoozeUntil(days, now, server) }
  return { ...input, due: dayText(gameDay(now, server) + days) }
}

/** Snoozes a custom task offers (days from today). */
export const CUSTOM_SNOOZES = [1, 2, 3, 5, 7] as const

/** "45m", "5h 12m", "3d 4h" (rounded up to the minute). */
export function formatSpan(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
