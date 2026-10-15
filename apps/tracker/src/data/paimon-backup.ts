/**
 * paimon.moe's own backup (Settings → Export/Import: one JSON object of its
 * saved keys), read for what overlaps with this tracker: achievements, the
 * calculator's to-do list, AR, World Level and server. paimon.moe (MIT) keeps
 * one set of keys per account: its first has bare keys (`achievement`), the
 * others prefix theirs with the account's value (`account2-achievement`);
 * `accounts` lists those values ("account2,account3").
 *
 * - `achievement`: `{"<category>": {"<achievement id>": true}}` (game ids).
 * - `todos`: `[{type: "character" | "weapon", character | weapon: {id, …}
 *   | null, level: {from, to}, resources: {<item id>: n}, original: {…}},
 *   {type: "item", resources: {<item id>: n}}]`; `resources` is what is
 *   left, `original` what the entry asked for. Talent levels are not kept,
 *   only the materials they add.
 * - `ar`, `wl`: numbers; `server`: "Asia", "America", "Europe", "TW, HK, MO".
 * - `wish-uid`: the account's UID (when it imported wishes).
 */

import type { GenshinServer } from '@gdt/shared'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Keys paimon.moe saves per account (the wish counters and collections too, to find accounts). */
const ACCOUNT_KEYS = [
  'achievement',
  'achievement-checklist',
  'todos',
  'ar',
  'wl',
  'server',
  'wish-uid',
  'characters',
  'weapons',
  'wish-counter-character-event',
  'wish-counter-weapon-event',
  'wish-counter-standard',
  'wish-counter-beginners',
  'collectables-updated',
  'furnishing',
  'fishing',
] as const

export interface PaimonAccount {
  /** '' for paimon.moe's first account, else `<value>-`. */
  prefix: string
  /** paimon.moe's account value ('main' for the first). */
  value: string
  /** `wish-uid`, when it has one. */
  uid: string | null
}

/** Whether a parsed JSON file is a paimon.moe backup (not a Seelie or GOOD file). */
export function isPaimonBackup(json: unknown): boolean {
  if (!isObject(json) || Array.isArray(json.goals) || 'format' in json) return false
  return paimonAccounts(json).length > 0
}

/** The backup's accounts that have any of paimon.moe's keys, its first account first. */
export function paimonAccounts(json: Json): PaimonAccount[] {
  const values = new Set<string>(['main'])
  if (typeof json.accounts === 'string') {
    for (const v of json.accounts.split(',')) if (v.trim()) values.add(v.trim())
  }
  // Accounts the list lost still have their keys.
  for (const key of Object.keys(json)) {
    for (const suffix of ACCOUNT_KEYS) {
      if (key.endsWith(`-${suffix}`)) {
        const value = key.slice(0, -suffix.length - 1)
        if (/^[a-z]+\d+$/.test(value)) values.add(value)
      }
    }
  }
  const out: PaimonAccount[] = []
  for (const value of values) {
    const prefix = value === 'main' ? '' : `${value}-`
    if (!ACCOUNT_KEYS.some((k) => json[prefix + k] !== undefined && json[prefix + k] !== null)) {
      continue
    }
    const uid = json[`${prefix}wish-uid`]
    out.push({
      prefix,
      value,
      uid: typeof uid === 'string' || typeof uid === 'number' ? String(uid).trim() || null : null,
    })
  }
  return out
}

/** The account to read: the one with this UID, the only one, else the first with `has`. */
export function pickPaimonAccount(
  accounts: readonly PaimonAccount[],
  uid: string | null | undefined,
  has: (a: PaimonAccount) => boolean = () => true,
): number {
  const same = uid ? accounts.findIndex((a) => a.uid === uid) : -1
  if (same >= 0) return same
  const first = accounts.findIndex(has)
  return first >= 0 ? first : 0
}

/** Completed achievement ids of one account, sorted. */
export function paimonAchievements(json: Json, prefix: string): number[] {
  const saved = json[`${prefix}achievement`]
  if (!isObject(saved)) return []
  const ids = new Set<number>()
  for (const category of Object.values(saved)) {
    if (!isObject(category)) continue
    for (const [id, done] of Object.entries(category)) {
      if (done === true && /^\d+$/.test(id)) ids.add(Number(id))
    }
  }
  return [...ids].sort((a, b) => a - b)
}

export interface PaimonLevelTodo {
  type: 'character' | 'weapon'
  /** paimon.moe's character or weapon id ("hu_tao", "the_catch"). */
  id: string
  from: number
  to: number
  /** What the entry asked for, by paimon.moe item id. */
  original: Record<string, number>
}

export interface PaimonTodos {
  levels: PaimonLevelTodo[]
  /** The item entries' counts left, summed, by paimon.moe item id. */
  items: Record<string, number>
  /** Entries without a character or weapon (level-only calculations). */
  anonymous: number
}

const counts = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {}
  if (!isObject(value)) return out
  for (const [id, n] of Object.entries(value)) {
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[id] = Math.trunc(n)
  }
  return out
}

const level = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 100 ? n : null
}

/** The to-do list of one account. */
export function paimonTodos(json: Json, prefix: string): PaimonTodos {
  const out: PaimonTodos = { levels: [], items: {}, anonymous: 0 }
  const list = json[`${prefix}todos`]
  if (!Array.isArray(list)) return out
  for (const entry of list as unknown[]) {
    if (!isObject(entry)) continue
    if (entry.type === 'item') {
      for (const [id, n] of Object.entries(counts(entry.resources))) {
        out.items[id] = (out.items[id] ?? 0) + n
      }
      continue
    }
    if (entry.type !== 'character' && entry.type !== 'weapon') continue
    const subject = entry[entry.type]
    const id = isObject(subject) && typeof subject.id === 'string' ? subject.id : null
    const lv = isObject(entry.level) ? entry.level : {}
    const from = level(lv.from)
    const to = level(lv.to)
    if (!id || from === null || to === null) {
      out.anonymous++
      continue
    }
    out.levels.push({
      type: entry.type,
      id,
      from,
      to: Math.max(from, to),
      original: counts(entry.original ?? entry.resources),
    })
  }
  return out
}

const PAIMON_SERVERS: Readonly<Record<string, GenshinServer>> = {
  Asia: 'ASIA',
  America: 'AMERICA',
  Europe: 'EUROPE',
  'TW, HK, MO': 'SAR',
}

export interface PaimonSettings {
  ar?: number
  wl?: number
  server?: GenshinServer
}

/** AR, World Level and server of one account (only what it saved, in range). */
export function paimonSettings(json: Json, prefix: string): PaimonSettings {
  const out: PaimonSettings = {}
  const num = (key: string) => {
    const v = json[`${prefix}${key}`]
    const n = typeof v === 'string' && v.trim() ? Number(v) : v
    return typeof n === 'number' && Number.isInteger(n) ? n : null
  }
  const ar = num('ar')
  if (ar !== null && ar >= 1 && ar <= 60) out.ar = ar
  const wl = num('wl')
  if (wl !== null && wl >= 0 && wl <= 9) out.wl = wl
  const server = json[`${prefix}server`]
  if (typeof server === 'string' && PAIMON_SERVERS[server]) out.server = PAIMON_SERVERS[server]
  return out
}
