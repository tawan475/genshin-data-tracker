/**
 * Binary encodings of the section shapes in sections.ts (storage format v2).
 * Each encodes a section's canonical value (the JSON a v1 blob holds) into
 * varints, column by column, and decodes it back to the same value: the JSON
 * text of the decoded value equals the original's, which every write checks
 * (see section-blob.ts) before it trusts the binary form.
 *
 * A delta's base is not stored here: the snapshot row names it, and the
 * section's content address (which covers the base's hash) keeps deltas of
 * different bases apart. `encode` takes the value without `b` plus whether
 * it is a delta; `decode` gives the value back with `b` set to the key the
 * caller names its base by.
 *
 * Every encoder throws (RangeError, TypeError) on a value outside what its
 * layout holds: a float, a number past 2^52, an unexpected field. The caller
 * then stores that section as JSON instead, so nothing is ever lost to a
 * layout that did not foresee it.
 *
 * These layouts are a storage format: data written today must decode
 * forever. Change a layout only by adding a new codec version (see the
 * format byte in section-blob.ts), never by editing one.
 */

import type { KeyRef } from '../dictionary'
import { ByteReader, ByteWriter, CorruptDataError } from './bytes'
import type { SectionKind } from './sections'

// ------------------------------------------------------------------ cells
// A KeyRef cell: a number as zigzag(n - previous) * 2 (previous is 0 unless
// the column is delta-coded), a string as length * 2 + 1 then its UTF-8.

function writeRef(w: ByteWriter, value: KeyRef, previous: number): number {
  if (typeof value === 'number') {
    const delta = value - previous
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(delta) || Math.abs(delta) > 2 ** 50) {
      throw new RangeError(`Not a storable integer: ${value}`)
    }
    w.uint((delta >= 0 ? delta * 2 : -delta * 2 - 1) * 2)
    return value
  }
  if (typeof value !== 'string') throw new TypeError('Not a key')
  const bytes = new TextEncoder().encode(value)
  w.uint(bytes.length * 2 + 1).bytes(bytes)
  return previous
}

function readRef(r: ByteReader, previous: number): [KeyRef, number] {
  const tag = r.uint()
  if (tag % 2 === 1) {
    const length = (tag - 1) / 2
    return [decodeUtf8(r.bytes(length)), previous]
  }
  const z = tag / 2
  const delta = z % 2 === 0 ? z / 2 : -(z + 1) / 2
  const value = previous + delta
  return [value, value]
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
function decodeUtf8(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes)
  } catch {
    throw new CorruptDataError('Invalid UTF-8')
  }
}

function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > 2 ** 51) {
    throw new RangeError(`Not a storable integer: ${String(value)}`)
  }
  return value
}

function uint(value: unknown): number {
  const n = int(value)
  if (n < 0) throw new RangeError(`Negative: ${n}`)
  return n
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Not an array')
  return value
}

/** An object with exactly `keys` (in that order; `optional` ones may be absent). */
function fields(value: unknown, keys: readonly string[], optional: readonly string[] = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Not an object')
  }
  const own = Object.keys(value)
  const expected = keys.filter((k) => !optional.includes(k) || k in value)
  if (own.length !== expected.length || own.some((k, i) => k !== expected[i])) {
    throw new TypeError(`Unexpected fields: ${own.join(',')}`)
  }
  return value as Record<string, unknown>
}

// ------------------------------------------------------------------ rows
// characters, weapons, characterExtras: arrays of trimmed rows. Stored by
// column: every row's length, then column 0 (the dictionary ref, ascending,
// so delta-coded), then each further column for the rows long enough to
// have it.

function writeRows(w: ByteWriter, value: unknown, deltaColumns: ReadonlySet<number>): void {
  const rows = array(value).map((row) => array(row) as KeyRef[])
  w.uint(rows.length)
  let width = 0
  for (const row of rows) {
    if (row.length === 0) throw new RangeError('Empty row')
    w.uint(row.length)
    width = Math.max(width, row.length)
  }
  for (let column = 0; column < width; column++) {
    let previous = 0
    for (const row of rows) {
      if (row.length <= column) continue
      const cell = row[column]!
      previous = writeRef(w, cell, deltaColumns.has(column) ? previous : 0)
    }
  }
}

function readRows(r: ByteReader, deltaColumns: ReadonlySet<number>): KeyRef[][] {
  const count = r.uint()
  if (count > r.remaining) throw new CorruptDataError('Row count past the data')
  const rows: KeyRef[][] = []
  for (let i = 0; i < count; i++) rows.push(new Array<KeyRef>(r.uint()))
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  for (let column = 0; column < width; column++) {
    let previous = 0
    for (const row of rows) {
      if (row.length <= column) continue
      const [cell, next] = readRef(r, deltaColumns.has(column) ? previous : 0)
      row[column] = cell
      if (deltaColumns.has(column)) previous = next
    }
  }
  return rows
}

// --------------------------------------------------------- kind layouts

/** Flags byte of the keyed layouts: bit 0 = the section is a delta. */
const DELTA = 1
/** achievementTimes: bit 1 = times are delta-coded (each vs the previous). */
const TIMES_DELTA = 2

export interface BinaryInput {
  /** The canonical value without `b`. */
  value: unknown
  delta: boolean
}

/** What a layout may vary per section (it tries each and keeps the smallest). */
type Variant = number

interface Layout {
  variants: readonly Variant[]
  encode(w: ByteWriter, input: BinaryInput, variant: Variant): void
  /** `base` is what `b` is set to when the section is a delta. */
  decode(r: ByteReader, base: string | null): unknown
}

const COLUMN0 = new Set([0])

const rowsLayout: Layout = {
  variants: [0],
  encode(w, { value, delta }) {
    if (delta) throw new TypeError('Rows sections have no deltas')
    writeRows(w, value, COLUMN0)
  },
  decode(r) {
    return readRows(r, COLUMN0)
  },
}

function withBase(base: string | null, flags: number): { b?: string } {
  if ((flags & DELTA) === 0) return {}
  if (base === null) throw new CorruptDataError('A delta section needs its base')
  return { b: base }
}

const artifactsLayout: Layout = {
  variants: [0],
  encode(w, { value, delta }) {
    const v = fields(value, ['i', 'l', 'f'])
    const ids = array(v.i)
    const locations = array(v.l) as KeyRef[]
    const flags = array(v.f)
    if (locations.length !== ids.length || flags.length !== ids.length) {
      throw new RangeError('Columns differ in length')
    }
    w.byte(delta ? DELTA : 0).uint(ids.length)
    for (const id of ids) w.uint(uint(id))
    for (const location of locations) writeRef(w, location, 0)
    for (const flag of flags) w.int(int(flag))
  },
  decode(r, base) {
    const flags = r.byte()
    const count = r.uint()
    if (count > r.remaining) throw new CorruptDataError('Count past the data')
    const i: number[] = []
    for (let n = 0; n < count; n++) i.push(r.uint())
    const l: KeyRef[] = []
    for (let n = 0; n < count; n++) l.push(readRef(r, 0)[0])
    const f: number[] = []
    for (let n = 0; n < count; n++) f.push(r.int())
    return { ...withBase(base, flags), i, l, f }
  },
}

const materialsLayout: Layout = {
  variants: [0],
  encode(w, { value, delta }) {
    const entries = array(fields(value, ['m']).m).map((e) => array(e))
    w.byte(delta ? DELTA : 0).uint(entries.length)
    let previous = 0
    for (const entry of entries) {
      if (entry.length !== 2) throw new RangeError('Not a [key, count] entry')
      previous = writeRef(w, entry[0] as KeyRef, previous)
    }
    for (const entry of entries) w.int(int(entry[1]))
  },
  decode(r, base) {
    const flags = r.byte()
    const count = r.uint()
    if (count > r.remaining) throw new CorruptDataError('Count past the data')
    const keys: KeyRef[] = []
    let previous = 0
    for (let n = 0; n < count; n++) {
      const [key, next] = readRef(r, previous)
      keys.push(key)
      previous = next
    }
    const m = keys.map((key): [KeyRef, number] => [key, r.int()])
    return { ...withBase(base, flags), m }
  },
}

const achievementsLayout: Layout = {
  variants: [0],
  encode(w, { value, delta }) {
    if (delta) throw new TypeError('Achievements have no deltas')
    const ids = array(value)
    w.uint(ids.length)
    for (const id of ids) w.uint(uint(id))
  },
  decode(r) {
    const count = r.uint()
    if (count > r.remaining) throw new CorruptDataError('Count past the data')
    const ids: number[] = []
    for (let n = 0; n < count; n++) ids.push(r.uint())
    return ids
  },
}

const achievementTimesLayout: Layout = {
  // Plain times, or each as the difference from the previous one: a run of
  // achievements finished together is a run of small numbers.
  variants: [0, TIMES_DELTA],
  encode(w, { value, delta }, variant) {
    const v = fields(value, ['i', 't'])
    const ids = array(v.i)
    const times = array(v.t)
    if (times.length !== ids.length) throw new RangeError('Columns differ in length')
    w.byte((delta ? DELTA : 0) | variant).uint(ids.length)
    for (const id of ids) w.uint(uint(id))
    let previous = 0
    for (const time of times) {
      const t = int(time)
      w.int(variant === TIMES_DELTA ? t - previous : t)
      previous = t
    }
  },
  decode(r, base) {
    const flags = r.byte()
    const count = r.uint()
    if (count > r.remaining) throw new CorruptDataError('Count past the data')
    const i: number[] = []
    for (let n = 0; n < count; n++) i.push(r.uint())
    const t: number[] = []
    let previous = 0
    for (let n = 0; n < count; n++) {
      const value = (flags & TIMES_DELTA) !== 0 ? previous + r.int() : r.int()
      t.push(value)
      previous = value
    }
    return { ...withBase(base, flags), i, t }
  },
}

// player: an object of numbers and strings. Known keys are one byte (their
// index in PLAYER_KEYS, append-only), others are spelled out; lowercase hex
// strings (the game-data commit) are stored as bytes.

/** Append-only: a key's index is stored. */
const PLAYER_KEYS = [
  'uid',
  'ar',
  'arExp',
  'wl',
  'wlLimit',
  'resin',
  'storyKeys',
  'maxStamina',
  'gameData',
] as const

const VALUE_INT = 0
const VALUE_STRING = 1
const VALUE_HEX = 2

const playerLayout: Layout = {
  variants: [0],
  encode(w, { value, delta }) {
    if (delta) throw new TypeError('Player sections have no deltas')
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('Not an object')
    }
    const entries = Object.entries(value)
    w.uint(entries.length)
    for (const [key, field] of entries) {
      const index = (PLAYER_KEYS as readonly string[]).indexOf(key)
      if (index >= 0) w.uint(index * 2)
      else {
        const bytes = new TextEncoder().encode(key)
        w.uint(bytes.length * 2 + 1).bytes(bytes)
      }
      if (typeof field === 'number') {
        w.uint(VALUE_INT).int(int(field))
      } else if (typeof field === 'string' && field.length % 2 === 0 && /^[0-9a-f]*$/.test(field)) {
        w.uint(VALUE_HEX).uint(field.length / 2)
        for (let i = 0; i < field.length; i += 2) w.byte(parseInt(field.slice(i, i + 2), 16))
      } else if (typeof field === 'string') {
        w.uint(VALUE_STRING).string(field)
      } else {
        throw new TypeError(`Unsupported player value for ${key}`)
      }
    }
  },
  decode(r) {
    const count = r.uint()
    if (count > r.remaining) throw new CorruptDataError('Count past the data')
    const player: Record<string, number | string> = {}
    for (let n = 0; n < count; n++) {
      const tag = r.uint()
      let key: string
      if (tag % 2 === 0) {
        const known = PLAYER_KEYS[tag / 2]
        if (known === undefined) throw new CorruptDataError(`Unknown player key ${tag / 2}`)
        key = known
      } else key = decodeUtf8(r.bytes((tag - 1) / 2))
      const type = r.uint()
      if (type === VALUE_INT) player[key] = r.int()
      else if (type === VALUE_STRING) player[key] = r.string()
      else if (type === VALUE_HEX) {
        let hex = ''
        for (const byte of r.bytes(r.uint())) hex += byte.toString(16).padStart(2, '0')
        player[key] = hex
      } else throw new CorruptDataError(`Unknown player value type ${type}`)
    }
    return player
  },
}

const LAYOUTS: Record<SectionKind, Layout> = {
  characters: rowsLayout,
  weapons: rowsLayout,
  characterExtras: rowsLayout,
  artifacts: artifactsLayout,
  materials: materialsLayout,
  achievements: achievementsLayout,
  achievementTimes: achievementTimesLayout,
  player: playerLayout,
}

/** Every variant the kind's layout offers, encoded (the caller keeps the smallest). */
export function encodeBinaryVariants(kind: SectionKind, input: BinaryInput): Uint8Array[] {
  const layout = LAYOUTS[kind]
  return layout.variants.map((variant) => {
    const w = new ByteWriter()
    layout.encode(w, input, variant)
    return w.finish()
  })
}

export function decodeBinary(kind: SectionKind, data: Uint8Array, base: string | null): unknown {
  const r = new ByteReader(data)
  const value = LAYOUTS[kind].decode(r, base)
  r.end()
  return value
}

/** True when the binary layout of `kind` records deltas (so a delta's base must be given). */
export function isDeltaBinary(kind: SectionKind, data: Uint8Array): boolean {
  if (kind !== 'artifacts' && kind !== 'materials' && kind !== 'achievementTimes') return false
  return data.length > 0 && (data[0]! & DELTA) !== 0
}
