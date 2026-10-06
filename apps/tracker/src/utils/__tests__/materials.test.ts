import { decodeMaterialIndex, decodeMaterialNames } from '@gdt/game-data'
import materialsJson from '@gdt/game-data/data/materials.json'
import textJson from '@gdt/game-data/data/text/materials-en.json'
import type { MaterialIndexFile, MaterialTextFile } from '@gdt/game-data/format'
import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import {
  materialMatcher,
  materialName,
  materialRarity,
  matchRank,
  preloadMaterialNames,
  preloadMaterialRarities,
  resolveMaterialName,
  resolveMaterialRarity,
} from '../materials'

const indexFile = materialsJson as unknown as MaterialIndexFile
const names = decodeMaterialNames(indexFile, textJson as unknown as MaterialTextFile)
const index = decodeMaterialIndex(indexFile)

const BLUEPRINT = 'BasicTentANapBeneathTheSnow'

// First, while nothing in this file has loaded the game data yet.
describe('the shared lookups', () => {
  it('show the key words first, then the game name once it arrives', async () => {
    const label = computed(() => materialName('HerosWit'))
    expect(label.value).toBe('Heros Wit')
    await preloadMaterialNames()
    expect(label.value).toBe("Hero's Wit")
    expect(materialName(BLUEPRINT)).toBe('Basic Tent: "A Nap Beneath the Snow"')
    expect(materialName('SomethingFromAFuturePatch')).toBe('Something From A Future Patch')
  })

  it('use the fallback rarity until the index arrives, then the game one', async () => {
    const rarity = computed(() => materialRarity('Wolfhook', 0))
    expect(rarity.value).toBeNull()
    expect(materialRarity('HerosWit', 4)).toBe(4)
    await preloadMaterialRarities()
    expect(rarity.value).toBe(1)
    expect(materialRarity('SomethingFromAFuturePatch')).toBeNull()
  })
})

describe('material names', () => {
  it('uses the game name for every kind of item', () => {
    const name = (key: string) => resolveMaterialName(key, names)
    expect(name('HerosWit')).toBe("Hero's Wit")
    expect(name('AdeptusTemptation')).toBe("Adeptus' Temptation") // food
    expect(name('WindCatcher')).toBe('Wind Catcher') // gadget
    expect(name('AncientForgingBlueprint')).toBe('Ancient Forging Blueprint') // quest item
    expect(name(BLUEPRINT)).toBe('Basic Tent: "A Nap Beneath the Snow"') // blueprint
    expect(name('Wolfhook')).toBe('Wolfhook') // local specialty
  })

  it("falls back to the key's words", () => {
    // Before the names load, or without them.
    expect(resolveMaterialName('HerosWit', null)).toBe('Heros Wit')
    expect(resolveMaterialName('MysticEnhancementOre', undefined)).toBe('Mystic Enhancement Ore')
    // A key newer than the game data.
    expect(resolveMaterialName('SomethingFromAFuturePatch', names)).toBe(
      'Something From A Future Patch',
    )
    // A name the data left empty.
    expect(resolveMaterialName('HerosWit', { name: () => '' })).toBe('Heros Wit')
  })
})

describe('material rarity', () => {
  it("takes the game's rarity for every kind of item", () => {
    const rarity = (key: string) => resolveMaterialRarity(key, index)
    expect(rarity('HerosWit')).toBe(4)
    expect(rarity('AdeptusTemptation')).toBe(5)
    expect(rarity('WindCatcher')).toBe(4)
    expect(rarity('AncientForgingBlueprint')).toBe(1)
    expect(rarity(BLUEPRINT)).toBe(2)
    expect(rarity('Primogem')).toBe(5)
  })

  it("wins over the planner data's, which has none for local specialties", () => {
    expect(resolveMaterialRarity('Wolfhook', index, 0)).toBe(1)
    expect(resolveMaterialRarity('HerosWit', index, 2)).toBe(4)
  })

  it("falls back to the planner's, else to none", () => {
    // Before the index loads.
    expect(resolveMaterialRarity('HerosWit', null, 4)).toBe(4)
    expect(resolveMaterialRarity('Wolfhook', null, 0)).toBeNull()
    expect(resolveMaterialRarity('HerosWit', undefined)).toBeNull()
    // A key newer than the game data.
    expect(resolveMaterialRarity('SomethingFromAFuturePatch', index, 3)).toBe(3)
    expect(resolveMaterialRarity('SomethingFromAFuturePatch', index)).toBeNull()
    expect(resolveMaterialRarity('SomethingFromAFuturePatch', index, null)).toBeNull()
    // Nothing outside 1-5 is a rarity.
    expect(resolveMaterialRarity('X', { rarity: () => 0 }, 7)).toBeNull()
    expect(resolveMaterialRarity('X', { rarity: () => 6 }, 2)).toBe(2)
  })
})

describe('material search', () => {
  const find = (query: string, name: string) => materialMatcher(query)?.(name) ?? false

  it('matches the game names, symbols and accents aside', () => {
    expect(find("hero's wit", "Hero's Wit")).toBe(true)
    expect(find('heros', "Hero's Wit")).toBe(true)
    expect(find('nap beneath', 'Basic Tent: "A Nap Beneath the Snow"')).toBe(true)
    expect(find('tent snow', 'Basic Tent: "A Nap Beneath the Snow"')).toBe(true)
    expect(find('consomme', 'Delicious Consommé')).toBe(true)
    expect(find('Sautéed', 'Sautéed Matsutake')).toBe(true)
    expect(find('sauteed', 'Sautéed Matsutake')).toBe(true)
    expect(find('wit hero', "Hero's Wit")).toBe(true)
    expect(find('heros wits', "Hero's Wit")).toBe(false)
    expect(materialMatcher('  ')).toBeNull()
  })

  it('ranks names that start with the query first', () => {
    expect(matchRank("Hero's Wit", 'hero')).toBe(0)
    expect(matchRank('Basic Tent: "A Nap Beneath the Snow"', 'nap')).toBe(1)
    expect(matchRank('Delicious Consommé', 'somme')).toBe(2)
  })
})
