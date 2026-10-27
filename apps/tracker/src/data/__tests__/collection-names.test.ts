import { collectionText, loadCollections } from '@gdt/game-data/collections'
import { ARCHIVE_TABS } from '@gdt/shared'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  archiveEntries,
  aranaraTotal,
  handbookNames,
  livingBeing,
  nameOf,
  questChapter,
  recipeEntries,
  tcgCardName,
  tcgEntries,
  wardrobeEntries,
  type CollectionCatalog,
} from '../collection-names'
import { recipeRows } from '../recipes'

let en: CollectionCatalog
let ja: CollectionCatalog

beforeAll(async () => {
  const [data, english, japanese] = await Promise.all([
    loadCollections(),
    collectionText('en'),
    collectionText('ja'),
  ])
  en = { data, text: english, english }
  ja = { data, text: japanese, english }
})

describe('collection names', () => {
  it('lists every Archive tab, named, in the game order', () => {
    for (const tab of ARCHIVE_TABS) {
      const entries = archiveEntries(en, tab)
      expect(entries.length, tab).toBeGreaterThan(50)
      expect(entries.filter((e) => e.name.startsWith('#')).length, tab).toBeLessThan(
        entries.length / 20,
      )
    }
    expect(archiveEntries(en, 'weapons').find((w) => w.id === 30_211_101)?.name).toBe('Dull Blade')
    expect(archiveEntries(en, 'materials')[0]!.icon).toMatch(/^UI_/)
    expect(questChapter(en, 10_010_002)).toContain('Prologue')
  })

  it('names in the language on screen, English where it has none, the id last', () => {
    expect(nameOf(ja, 'weapons', 30_211_101)).not.toBe('Dull Blade')
    expect(nameOf(en, 'weapons', 1)).toBe('#1')
    expect(livingBeing(en, 20_010_101)).toMatchObject({ name: 'Dendro Slime', count: 'kill' })
  })

  it('finds Handbook targets by their id, else by their quest', () => {
    const names = handbookNames(en)
    expect(names.chapter(10_001)).toBe('Chapter 1')
    expect(names.target(60_001).name).toContain('Statue')
    expect(names.target(6_000_001).name).toBe(names.target(60_001).name)
    expect(names.target(1).name).toBe('#1')
  })

  it('knows the TCG cards, the wardrobe without default outfits, recipes and Aranara', () => {
    expect(tcgEntries(en, 'characters').every((c) => c.id < 10_000)).toBe(true)
    expect(tcgEntries(en, 'actions').every((c) => c.id >= 10_000)).toBe(true)
    expect(tcgCardName(en, 1101)).toBe('Ganyu')
    const outfits = wardrobeEntries(en, 'outfits')
    expect(outfits.length).toBeLessThan(en.data.outfits.length)
    // Hidden gliders (event ones listed once owned) only for their owners.
    const hidden = en.data.gliders.filter((g) => g.hidden === 1)
    expect(hidden.length).toBeGreaterThan(0)
    expect(wardrobeEntries(en, 'gliders').length).toBe(en.data.gliders.length - hidden.length)
    const owned = new Set([hidden[0]!.id])
    expect(wardrobeEntries(en, 'gliders', owned).map((g) => g.id)).toContain(hidden[0]!.id)
    // The quest's Exaiphanes Blade is never listed; nothing without a name is.
    expect(wardrobeEntries(en, 'weaponSkins').some((s) => s.id === 390002)).toBe(false)
    expect(wardrobeEntries(en, 'outfits').every((o) => !o.name.startsWith('#'))).toBe(true)
    expect(recipeEntries(en).every((r) => r.max > 0)).toBe(true)
    expect(aranaraTotal(en)).toBeGreaterThan(0)
  })
})

describe('recipeRows', () => {
  const recipes = [
    { id: 1, name: 'A', icon: '', rarity: 1, max: 5 },
    { id: 2, name: 'B', icon: '', rarity: 2, max: 10 },
    { id: 3, name: 'C', icon: '', rarity: 3, max: 15 },
  ]
  it('tells locked, not mastered and mastered apart, and keeps unknown unlocked ones', () => {
    const rows = recipeRows(recipes, { '1': 5, '2': 0, '9': 3 })
    expect(rows.map((r) => [r.id, r.state, r.proficiency, r.unknown])).toEqual([
      [1, 'mastered', 5, false],
      [2, 'unmastered', 0, false],
      [3, 'locked', 0, false],
      [9, 'unmastered', 3, true],
    ])
  })
})
