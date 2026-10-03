import characterKeys from './data/characters.json'
import weaponKeys from './data/weapons.json'

/**
 * A GOOD key list where a key's id is its 1-based position. Lists only ever
 * grow (`scripts/update-dictionary.mjs`), so an id never changes meaning.
 * Id 0 is reserved for "no key" (an unequipped weapon's location).
 */
export interface KeyDictionary {
  readonly keys: readonly string[]
  readonly ids: ReadonlyMap<string, number>
}

/**
 * A key as stored: its dictionary id when the dictionary knows it, otherwise
 * the raw key. New game content can therefore be imported before the
 * dictionary is updated; it just costs a few more bytes.
 */
export type KeyRef = number | string

export function createDictionary(keys: readonly string[]): KeyDictionary {
  return { keys, ids: new Map(keys.map((key, index) => [key, index + 1])) }
}

export const CHARACTERS = createDictionary(characterKeys)
export const WEAPONS = createDictionary(weaponKeys)

export function toRef(dictionary: KeyDictionary, key: string): KeyRef {
  if (key === '') return 0
  return dictionary.ids.get(key) ?? key
}

/** Thrown when stored data references an id this build's dictionary lacks. */
export class DictionaryOutdatedError extends Error {
  constructor(id: number) {
    super(`Dictionary has no key for id ${id}; this build is older than the stored data`)
    this.name = 'DictionaryOutdatedError'
  }
}

export function fromRef(dictionary: KeyDictionary, ref: KeyRef): string {
  if (typeof ref === 'string') return ref
  if (ref === 0) return ''
  const key = dictionary.keys[ref - 1]
  if (key === undefined) throw new DictionaryOutdatedError(ref)
  return key
}
