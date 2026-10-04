/**
 * Reading ExcelBinOutput rows safely.
 *
 * Since 7.0 the dump omits fields that hold their default value (0, false,
 * "", the first enum value), so a missing field reads as that default here.
 * The flip side: a field the game renamed or obfuscated also reads as the
 * default, silently. `checkFields` catches that by requiring each field the
 * compiler relies on to appear in a minimum share of rows.
 */

import type { Problems } from './problems.ts'

export type Row = Record<string, unknown>

function fail(field: string, value: unknown, expected: string): never {
  throw new Error(`Field "${field}" is ${JSON.stringify(value)}, expected ${expected}`)
}

/** A number field; missing means 0. Numeric strings (useParam) are accepted. */
export function num(row: Row, field: string): number {
  const value = row[field]
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fail(field, value, 'a number')
}

/** A string field; missing means "". */
export function str(row: Row, field: string): string {
  const value = row[field]
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  return fail(field, value, 'a string')
}

/** A boolean field; missing means false. */
export function bool(row: Row, field: string): boolean {
  const value = row[field]
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  return fail(field, value, 'a boolean')
}

/** An array field; missing means []. */
export function list<T = Row>(row: Row, field: string): T[] {
  const value = row[field]
  if (value === undefined || value === null) return []
  if (Array.isArray(value)) return value as T[]
  return fail(field, value, 'an array')
}

export interface SlotCost {
  /** Position in the cost list; it says what the item is for (gem, boss drop, …). */
  slot: number
  id: number
  count: number
}

/**
 * A `costItems`-style list. Empty slots are `{}` placeholders and a slot can
 * carry a count without an id (the Traveler's boss slot): both are skipped,
 * keeping each real item's slot number.
 */
export function costs(row: Row, field: string): SlotCost[] {
  return list(row, field)
    .map((entry, slot) => ({ slot, id: num(entry, 'id'), count: num(entry, 'count') }))
    .filter((cost) => cost.id > 0 && cost.count > 0)
}

/**
 * field -> minimum presence: a share of rows when below 1 (0.9 = 90%), an
 * absolute row count otherwise. Set each threshold well under what a healthy
 * dump has, since defaults are omitted.
 */
export type FieldSpec = Record<string, number>

/**
 * Reports each field present in fewer rows than its spec requires: the usual
 * sign that the game renamed or obfuscated it in this version.
 */
export function checkFields(
  problems: Problems,
  file: string,
  rows: Row[],
  spec: FieldSpec,
  severity: 'error' | 'warn' = 'error',
): void {
  if (rows.length === 0) {
    problems[severity](`${file} has no rows`)
    return
  }
  const present = new Map<string, number>()
  for (const row of rows) {
    for (const field of Object.keys(row)) present.set(field, (present.get(field) ?? 0) + 1)
  }
  for (const [field, min] of Object.entries(spec)) {
    const count = present.get(field) ?? 0
    const needed = min < 1 ? Math.ceil(min * rows.length) : min
    if (count >= needed) continue
    const obfuscated = [...present.keys()].filter((k) => /^[A-Z]{11}$/.test(k)).slice(0, 8)
    problems[severity](
      `${file}: field "${field}" is in ${count} of ${rows.length} rows (expected at least ${needed}). ` +
        'It was probably renamed or obfuscated in this dump: find its new name in the raw JSON and ' +
        `update the compiler${obfuscated.length ? ` (obfuscated fields here: ${obfuscated.join(', ')})` : ''}.`,
    )
  }
}

/** Text lookup over one or more TextMap files (hash -> text), first hit wins. */
export class TextMap {
  private readonly maps: Record<string, string>[]

  constructor(...maps: Record<string, string>[]) {
    this.maps = maps
  }

  get(hash: unknown): string | undefined {
    if (hash === undefined || hash === null || hash === 0) return undefined
    const key = String(hash)
    for (const map of this.maps) {
      const text = map[key]
      if (text !== undefined && text !== '') return text
    }
    return undefined
  }

  /** Every text in every map (for "is this name in the game at all" checks). */
  *values(): IterableIterator<string> {
    for (const map of this.maps) yield* Object.values(map)
  }
}
