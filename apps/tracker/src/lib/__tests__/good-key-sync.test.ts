/**
 * `toGoodKey` exists twice: @gdt/shared's (packages/shared/src/good.ts, what
 * the tracker stores keys with) and the game data's copy
 * (`@gdt/game-data/good-key`, what its compiler makes every key with). They
 * must agree on every name, or stored keys and the game data's keys drift
 * apart. This runs both over real names and random strings; change the two
 * together.
 */

import { toGoodKey as gameDataKey } from '@gdt/game-data/good-key'
import { toGoodKey } from '@gdt/shared'
import { describe, expect, it } from 'vitest'

/** A no-break space: whitespace to toGoodKey, not to irminsul. */
const NBSP = String.fromCharCode(0xa0)

const NAMES = [
  "Gladiator's Finale",
  'Spirit Locket of Boreas',
  '"The Catch"',
  '',
  'Kaedehara Kazuha',
  'Hu Tao',
  "Wolf's Gravestone",
  'Philosophies of "Freedom"',
  '"Ultimate Overlord\'s Mega Magic Sword"',
  'Mail-Order Catalog',
  'Ninety-Nine',
  '  Two  spaces\tand a tab ',
  'Héros',
  `hu${NBSP}tao`,
]

/** A seeded generator, so a failure names the same strings every run. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return state / 2 ** 31
  }
}

describe("toGoodKey: the tracker's and the game data's copies", () => {
  it('agree on names', () => {
    for (const name of NAMES) expect(gameDataKey(name), JSON.stringify(name)).toBe(toGoodKey(name))
  })

  it('agree on 2,000 random strings of letters, digits, spaces and symbols', () => {
    const next = random(475)
    const alphabet = `abcXYZ019 '"-.,:!?()&\t${NBSP}éß·★`
    for (let i = 0; i < 2000; i++) {
      const length = Math.floor(next() * 24)
      let name = ''
      for (let j = 0; j < length; j++) name += alphabet[Math.floor(next() * alphabet.length)]
      expect(gameDataKey(name), JSON.stringify(name)).toBe(toGoodKey(name))
    }
  })
})
