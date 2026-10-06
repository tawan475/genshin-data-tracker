/**
 * The rest of a Seelie export (see `@/data/seelie` for goals and
 * `seelie-items.ts` for item rows): tasks, the resin tracker and the
 * account's AR, World Level, server and Traveler.
 *
 * - `tasks[]`: custom tasks are `{id: n, task: name, recurring: days,
 *   notes, mode: "original" | "completed", next: "YYYY-MM-DD"}` (the game
 *   day they are due next). Seelie's permanent tasks and events are
 *   `{id: key, next: "YYYY-MM-DD HH:mm", done}`, `next` in server time:
 *   when a Done (the period's end, 03:59) or a snooze (a day's 04:00) lets
 *   it come back. Those with a built-in task here (Daily Commissions,
 *   Trounce Domains, Spiral Abyss, Imaginarium Theater, Paimon's Bargains)
 *   come along; events have no counterpart and are skipped.
 * - `resin: {amount, time}`: Original Resin at `time` (a date string).
 * - `ar`, `wl`, `server` ("america" / "europe" / "asia"), `gender`.
 */

import { GENSHIN_SERVERS, type CustomTask, type GenshinServer, type ManualResin } from '@gdt/shared'
import {
  BUILTIN_TASKS,
  dayText,
  gameDay,
  parseDay,
  parseServerClock,
  serverClockText,
} from '@/components/planner/tasks'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const int = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export interface SeelieCustomTask {
  /** `seelie<n>` for Seelie's task n, so importing the file again changes the same task. */
  id: string
  task: CustomTask
  /** The game day it is due, `YYYY-MM-DD`. */
  due: string
  /** Its place in the file. */
  position: number
}

export interface SeelieTasks {
  custom: SeelieCustomTask[]
  /** Built-in tasks resting until `next` (ms): done or snoozed in Seelie. */
  builtin: { id: string; next: number }[]
  /** Seelie keys with no built-in task here (events), sorted. */
  skipped: string[]
}

const MINUTE = 60_000

/** Seelie's custom task id `n` as a task id here (`[a-z0-9]{6,32}`). */
export function seelieTaskId(id: unknown): string | null {
  const n = int(id)
  if (n !== null && n >= 0) return `seelie${n}`
  if (typeof id !== 'string') return null
  const letters = id.toLowerCase().replace(/[^a-z0-9]/g, '')
  return letters ? `seelie${letters}`.slice(0, 32) : null
}

/**
 * The export's tasks, read on `server` (the account's: Seelie's times are
 * server time) at `now`. A permanent task that is due anyway (its `next`
 * has passed) brings nothing.
 */
export function mapSeelieTasks(
  json: unknown,
  server: string | null | undefined,
  now: number,
): SeelieTasks {
  const rows = isObject(json) && Array.isArray(json.tasks) ? json.tasks : []
  const custom: SeelieCustomTask[] = []
  const builtin = new Map<string, number>()
  const skipped = new Set<string>()
  const today = dayText(gameDay(now, server))
  for (const row of rows as unknown[]) {
    if (!isObject(row)) continue
    if (typeof row.task === 'string') {
      const id = seelieTaskId(row.id)
      const name = row.task.trim().slice(0, 80)
      if (!id || !name || custom.some((t) => t.id === id)) continue
      const next = typeof row.next === 'string' ? row.next.slice(0, 10) : ''
      const notes = typeof row.notes === 'string' ? row.notes.trim().slice(0, 1000) : ''
      const task: CustomTask = {
        name,
        every: clamp(int(row.recurring) ?? 1, 1, 30),
        mode: row.mode === 'completed' ? 'completed' : 'original',
      }
      if (notes) task.note = notes
      custom.push({
        id,
        task,
        due: parseDay(next) === null ? today : next,
        position: custom.length,
      })
      continue
    }
    if (typeof row.id !== 'string') continue
    const def = BUILTIN_TASKS.find((b) => b.seelie === row.id)
    if (!def) {
      skipped.add(row.id)
      continue
    }
    let next = typeof row.next === 'string' ? parseServerClock(row.next, server) : null
    if (next === null) continue
    // A Done rests until the period's end, which Seelie writes as 03:59: that is the 04:00 reset.
    if (serverClockText(next, server).endsWith(' 03:59')) next += MINUTE
    if (next > now) builtin.set(def.id, Math.max(builtin.get(def.id) ?? 0, next))
  }
  return {
    custom,
    builtin: [...builtin].map(([id, next]) => ({ id, next })),
    skipped: [...skipped].sort(),
  }
}

/** The export's resin tracker as a hand-set value (null without a time). */
export function mapSeelieResin(json: unknown): ManualResin | null {
  const resin = isObject(json) && isObject(json.resin) ? json.resin : null
  if (!resin) return null
  const amount = int(resin.amount)
  const time =
    typeof resin.time === 'string'
      ? Date.parse(resin.time)
      : typeof resin.time === 'number'
        ? resin.time
        : NaN
  if (amount === null || amount < 0 || !Number.isFinite(time) || time <= 0) return null
  return { value: Math.min(amount, 2_000), at: Math.trunc(time) }
}

export interface SeelieSettings {
  ar?: number
  wl?: number
  server?: GenshinServer
  traveler?: 'F' | 'M'
}

/** The export's AR, World Level, server and Traveler (only what it says, in range). */
export function mapSeelieSettings(json: unknown): SeelieSettings {
  const out: SeelieSettings = {}
  if (!isObject(json)) return out
  const ar = int(json.ar)
  if (ar !== null && ar >= 1 && ar <= 60) out.ar = ar
  const wl = int(json.wl)
  if (wl !== null && wl >= 0 && wl <= 9) out.wl = wl
  const server = typeof json.server === 'string' ? json.server.toUpperCase() : ''
  if ((GENSHIN_SERVERS as readonly string[]).includes(server)) out.server = server as GenshinServer
  if (json.gender === 'female') out.traveler = 'F'
  else if (json.gender === 'male') out.traveler = 'M'
  return out
}
