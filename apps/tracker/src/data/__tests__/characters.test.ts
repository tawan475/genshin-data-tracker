import type { Good, GoodCharacter } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  CHARACTER_SORTS,
  NO_CHARACTER_FILTERS,
  buildRoster,
  facetCounts,
  filterCharacters,
  hasCharacterFilters,
  sortCharacters,
  withFavorite,
  type CharacterSort,
  type SortDirection,
} from '@/data/characters'

const character = (
  key: string,
  level: number,
  constellation: number,
  talents: number,
): GoodCharacter => ({
  key,
  level,
  constellation,
  ascension: level >= 90 ? 6 : 5,
  talent: { auto: talents, skill: talents, burst: talents },
})

const good: Good = {
  format: 'GOOD',
  version: 3,
  source: 'test',
  characters: [
    character('HuTao', 90, 1, 10),
    character('Xiangling', 80, 6, 8),
    character('Furina', 90, 2, 9),
    character('Bennett', 70, 6, 6),
    character('Nahida', 90, 0, 9),
    character('TravelerAnemo', 60, 0, 1),
  ],
  weapons: [],
  artifacts: [],
  materials: {},
  gi_characters: { HuTao: { friendship: 10 }, Bennett: { friendship: 7 } },
}

const roster = buildRoster(good)
const keys = (list: { key: string }[]) => list.map((c) => c.key)
const directions: SortDirection[] = ['desc', 'asc']

describe('favourites first', () => {
  const favorites = new Set(['Bennett', 'TravelerAnemo', 'Nahida'])

  it('pins favourites above the rest under every sort and direction, each group in that sort', () => {
    for (const { value: sort } of CHARACTER_SORTS) {
      for (const direction of directions) {
        const plain = keys(sortCharacters(roster.characters, sort, direction))
        const pinned = keys(sortCharacters(roster.characters, sort, direction, favorites))
        const label = `${sort} ${direction}`
        expect(pinned.slice(0, 3), label).toEqual(plain.filter((k) => favorites.has(k)))
        expect(pinned.slice(3), label).toEqual(plain.filter((k) => !favorites.has(k)))
      }
    }
  })

  it('orders by level among favourites, then the rest', () => {
    expect(keys(sortCharacters(roster.characters, 'level', 'desc', favorites))).toEqual([
      'Nahida',
      'Bennett',
      'TravelerAnemo',
      // Level ties fall back to rarity, then name.
      'Furina',
      'HuTao',
      'Xiangling',
    ])
    expect(keys(sortCharacters(roster.characters, 'level', 'asc', favorites))).toEqual([
      'TravelerAnemo',
      'Bennett',
      'Nahida',
      'Xiangling',
      'Furina',
      'HuTao',
    ])
  })

  it('keeps unknown values last inside each group (friendship)', () => {
    const sort: CharacterSort = 'friendship'
    expect(keys(sortCharacters(roster.characters, sort, 'desc', favorites))).toEqual([
      'Bennett',
      'Nahida',
      'TravelerAnemo',
      'HuTao',
      'Furina',
      'Xiangling',
    ])
  })

  it('sorts as before without favourites', () => {
    expect(keys(sortCharacters(roster.characters, 'name', 'asc', new Set()))).toEqual(
      keys(sortCharacters(roster.characters, 'name', 'asc')),
    )
  })

  it('applies filters to both groups', () => {
    const filters = { ...NO_CHARACTER_FILTERS, element: 'pyro' as const }
    const list = sortCharacters(
      filterCharacters(roster.characters, filters, undefined, favorites),
      'level',
      'desc',
      favorites,
    )
    expect(keys(list)).toEqual(['Bennett', 'HuTao', 'Xiangling'])
  })

  it('filters to favourites only, and counts facets with it', () => {
    const filters = { ...NO_CHARACTER_FILTERS, favorites: true }
    expect(hasCharacterFilters(filters)).toBe(true)
    expect(hasCharacterFilters(NO_CHARACTER_FILTERS)).toBe(false)
    expect(keys(filterCharacters(roster.characters, filters, undefined, favorites)).sort()).toEqual(
      ['Bennett', 'Nahida', 'TravelerAnemo'],
    )
    // No favourites known: the filter keeps none.
    expect(filterCharacters(roster.characters, filters)).toEqual([])
    const elements = facetCounts(roster.characters, filters, 'element', (c) => c.element, favorites)
    expect(Object.fromEntries(elements)).toEqual({ pyro: 1, dendro: 1, anemo: 1 })
  })
})

describe('withFavorite', () => {
  it('adds a key once and removes it, keeping the others in order', () => {
    expect(withFavorite(['HuTao'], 'Furina', true)).toEqual(['HuTao', 'Furina'])
    expect(withFavorite(['HuTao', 'Furina'], 'HuTao', true)).toEqual(['Furina', 'HuTao'])
    expect(withFavorite(['HuTao', 'Furina', 'Nahida'], 'Furina', false)).toEqual([
      'HuTao',
      'Nahida',
    ])
    expect(withFavorite([], 'Furina', false)).toEqual([])
  })
})
