import { describe, expect, it } from 'vitest'
import {
  asLeyline,
  encodeSnapshot,
  LEYLINE_VERSION,
  leylineFileStem,
  normalizeGood,
  prepareSnapshot,
} from '../src'
import { MATERIALS } from '../src/dictionary/materials'
import { syntheticGood } from './synthetic'

/**
 * Leyline is additive: a file with `"leyline": 1` is read, stored and hashed
 * exactly as the same file without it, so today's normalizeGood (and every
 * deployed tracker before Leyline had a name) takes Capture's new files, and
 * plain GOOD files keep importing.
 */
async function contentHashOf(input: unknown) {
  const prepared = await prepareSnapshot(input, { materials: MATERIALS })
  const ids = new Map(prepared.artifactHashes.map((hash, i) => [hash, i + 1]))
  return (await encodeSnapshot(prepared, ids, MATERIALS)).contentHash
}

describe('Leyline', () => {
  const good = syntheticGood(7)
  const leyline = asLeyline(good)

  it('reads a file the same with or without its leyline key', async () => {
    const options = { materials: MATERIALS }
    expect(normalizeGood(leyline, options)).toEqual(normalizeGood(good, options))
    expect(await contentHashOf(leyline)).toBe(await contentHashOf(good))
  })

  it('keeps format GOOD and puts leyline right after source', () => {
    const keys = Object.keys(asLeyline({ format: 'GOOD', version: 3, source: 'Teyvat.me', x: 1 }))
    expect(keys).toEqual(['format', 'version', 'source', 'leyline', 'x'])
    expect(leyline.format).toBe('GOOD')
    expect(leyline.leyline).toBe(LEYLINE_VERSION)
    // Marking twice is the same as once.
    expect(Object.keys(asLeyline(leyline))).toEqual(Object.keys(leyline))
  })

  it('names exported files leyline-<time>', () => {
    expect(leylineFileStem(Date.UTC(2026, 5, 20, 14, 5, 43, 151))).toBe(
      'leyline-2026-06-20T14-05-43',
    )
  })
})
