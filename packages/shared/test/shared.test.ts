import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_SETTINGS_DEFAULTS,
  CHARACTERS,
  DictionaryOutdatedError,
  WEAPONS,
  calculateCV,
  calculateRV,
  deepMerge,
  fromRef,
  resolveImportTimestamp,
  serverFromUid,
  toGoodKey,
  toRef,
} from '../src'
import frozen from '../src/dictionary/frozen.json'
import { ARTIFACT_SETS } from '../src/dictionary/artifacts'
import { MATERIALS } from '../src/dictionary/materials'

describe('static dictionary', () => {
  // Ids are positions, and stored snapshots reference ids: a reordered or
  // shortened list silently corrupts every snapshot. Append with
  // `pnpm dictionary`, which also updates frozen.json.
  it.each([
    ['character', CHARACTERS],
    ['weapon', WEAPONS],
    ['material', MATERIALS],
    ['artifactSet', { keys: ARTIFACT_SETS }],
  ] as const)('%s list is append-only', (kind, dictionary) => {
    const pin = frozen[kind]
    const prefix = dictionary.keys.slice(0, pin.count).join('\n')
    expect(dictionary.keys.length).toBeGreaterThanOrEqual(pin.count)
    expect(createHash('sha256').update(prefix).digest('hex')).toBe(pin.sha256)
  })

  it('maps known keys to ids and keeps unknown keys as strings', () => {
    const ref = toRef(CHARACTERS, CHARACTERS.keys[0]!)
    expect(ref).toBe(1)
    expect(fromRef(CHARACTERS, ref)).toBe(CHARACTERS.keys[0])
    expect(toRef(CHARACTERS, 'NotACharacterYet')).toBe('NotACharacterYet')
    expect(toRef(CHARACTERS, '')).toBe(0)
    expect(fromRef(CHARACTERS, 0)).toBe('')
  })

  it('refuses ids newer than this build', () => {
    expect(() => fromRef(CHARACTERS, CHARACTERS.keys.length + 1)).toThrow(DictionaryOutdatedError)
  })
})

describe('toGoodKey', () => {
  it.each([
    ["Gladiator's Finale", 'GladiatorsFinale'],
    ['Spirit Locket of Boreas', 'SpiritLocketOfBoreas'],
    ['"The Catch"', 'TheCatch'],
    ['', ''],
  ])('%s -> %s', (name, key) => expect(toGoodKey(name)).toBe(key))
})

describe('artifact stats', () => {
  it('computes crit value and roll value', () => {
    const substats = [
      { key: 'critRate_', value: 3.9 },
      { key: 'critDMG_', value: 7.8 },
      { key: 'atk_', value: 5.83 },
    ]
    expect(calculateCV(substats)).toBe(15.6)
    expect(calculateRV(substats)).toBe(300)
  })
})

describe('deepMerge', () => {
  it('merges nested objects, replaces arrays, skips undefined', () => {
    const merged = deepMerge(ACCOUNT_SETTINGS_DEFAULTS, {
      materialsGraph: { groupBy: 'month', selectedKeys: ['Mora'], limit: undefined },
    })
    expect(merged.materialsGraph).toEqual({ selectedKeys: ['Mora'], groupBy: 'month', limit: 365 })
    expect(ACCOUNT_SETTINGS_DEFAULTS.materialsGraph.groupBy).toBe('day')
  })
})

describe('resolveImportTimestamp', () => {
  const now = 1_000
  it('prefers the explicit field, then the payload, then now', () => {
    expect(resolveImportTimestamp('1700000000000', 5, now)).toBe(1_700_000_000_000)
    expect(resolveImportTimestamp(undefined, 1_700_000_000_000, now)).toBe(1_700_000_000_000)
    expect(resolveImportTimestamp(undefined, undefined, now)).toBe(now)
  })

  it('accepts ISO strings and ignores junk', () => {
    expect(resolveImportTimestamp('2026-01-02T03:04:05Z', undefined, now)).toBe(
      Date.parse('2026-01-02T03:04:05Z'),
    )
    expect(resolveImportTimestamp('not a date', { nope: 1 }, now)).toBe(now)
    expect(resolveImportTimestamp('   ', true, now)).toBe(now)
    expect(resolveImportTimestamp(Number.NaN, Infinity, now)).toBe(now)
  })
})

describe('serverFromUid', () => {
  it('reads the region digit, second in ten-digit UIDs', () => {
    expect(serverFromUid('612345678')).toBe('AMERICA')
    expect(serverFromUid('712345678')).toBe('EUROPE')
    expect(serverFromUid('812345678')).toBe('ASIA')
    expect(serverFromUid('1812345678')).toBe('ASIA')
    expect(serverFromUid('912345678')).toBe('SAR')
  })

  it('knows nothing of China, malformed UIDs or ten digits without the leading 1', () => {
    for (const uid of ['112345678', '212345678', '512345678', '1012345678', '8123456789']) {
      expect(serverFromUid(uid), uid).toBeNull()
    }
    for (const uid of ['', '81234567', '81234567890', ' 812345678', '8123x5678']) {
      expect(serverFromUid(uid), uid).toBeNull()
    }
  })
})
