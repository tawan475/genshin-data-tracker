import { describe, expect, it } from 'vitest'
import plannerJson from '../data/planner.json'
import weekdaysJson from '../overrides/weekdays.json'
import { decodePlanner, type ItemCost, type PlannerCharacter } from '../src'
import type { PlannerFile } from '../src/format'
import goFixture from './fixtures/go-character-costs.json'

const file = plannerJson as unknown as PlannerFile
const planner = decodePlanner(file)

/** Item costs as sorted "Key x count" strings, merging duplicates. */
function canonical(items: { key: string; count: number }[]): string[] {
  const totals = new Map<string, number>()
  for (const { key, count } of items) totals.set(key, (totals.get(key) ?? 0) + count)
  return [...totals].map(([key, count]) => `${key} x${count}`).sort()
}
const ours = (items: ItemCost[]) =>
  canonical(items.map((i) => ({ key: i.material.key, count: i.count })))

type GoLevel = [number, [number, number][]]
const go = goFixture as unknown as {
  items: string[]
  characters: Record<string, { ascension: GoLevel[]; talents: GoLevel[][] }>
}
const theirs = ([, items]: GoLevel) =>
  canonical(items.map(([index, count]) => ({ key: go.items[index]!, count })))

function character(key: string): PlannerCharacter {
  const found = planner.characters.get(key)
  if (!found) throw new Error(`no character ${key}`)
  return found
}

describe('character costs match Genshin Optimizer (test oracle)', () => {
  const shared = Object.keys(go.characters).filter((key) => planner.characters.has(key))

  it('covers nearly every GO character', () => {
    // GO keys we lack would be characters the dump does not have (or named
    // differently from what irminsul exports).
    const missing = Object.keys(go.characters).filter((key) => !planner.characters.has(key))
    expect(shared.length).toBeGreaterThan(120)
    expect(missing.length).toBeLessThanOrEqual(2)
  })

  it.each(shared)('%s', (key) => {
    const c = character(key)
    const g = go.characters[key]!
    for (let phase = 1; phase <= 6; phase++) {
      const level = g.ascension[phase - 1]!
      expect({
        phase,
        mora: c.ascension[phase]!.mora,
        items: ours(c.ascension[phase]!.items),
      }).toEqual({
        phase,
        mora: level[0],
        items: theirs(level),
      })
    }
    const goTalents =
      g.talents.length === 1 ? [g.talents[0]!, g.talents[0]!, g.talents[0]!] : g.talents
    ;(['normal', 'skill', 'burst'] as const).forEach((talent, t) => {
      for (let level = 2; level <= 10; level++) {
        const expected = goTalents[t]![level - 2]!
        const actual = c.talents[talent][level - 1]!
        expect({ talent, level, mora: actual.mora, items: ours(actual.items) }).toEqual({
          talent,
          level,
          mora: expected[0],
          items: theirs(expected),
        })
      }
    })
  })
})

describe('special characters', () => {
  it('Geo Traveler: normal attack uses Mondstadt books and Dvalin’s Sigh, skill and burst Liyue books', () => {
    const geo = character('TravelerGeo')
    const books = (talent: 'normal' | 'skill') =>
      geo.talents[talent]
        .slice(1)
        .map((level) => level.items.find((i) => i.material.kind === 'book')!.material.key)
    expect(books('normal')).toEqual([
      'TeachingsOfFreedom',
      'GuideToResistance',
      'GuideToBallad',
      'GuideToFreedom',
      'GuideToResistance',
      'PhilosophiesOfBallad',
      'PhilosophiesOfFreedom',
      'PhilosophiesOfResistance',
      'PhilosophiesOfBallad',
    ])
    expect(
      new Set(books('skill').map((k) => k.replace(/^(TeachingsOf|GuideTo|PhilosophiesOf)/, ''))),
    ).toEqual(new Set(['Prosperity', 'Diligence', 'Gold']))
    const weekly = geo.talents.normal[6]!.items.find((i) => i.material.kind === 'weekly')!.material
      .key
    expect(weekly).toBe('DvalinsSigh')
    expect(geo.talents.skill).toBe(geo.talents.burst)
    expect(geo.element).toBe('Geo')
  })

  it('has one Traveler per element, as irminsul keys them', () => {
    const travelers = [...planner.characters.keys()].filter((k) => k.startsWith('Traveler')).sort()
    expect(travelers).toEqual([
      'TravelerAnemo',
      'TravelerCryo',
      'TravelerDendro',
      'TravelerElectro',
      'TravelerGeo',
      'TravelerHydro',
      'TravelerPyro',
    ])
    expect(planner.characters.has('Traveler')).toBe(false)
  })

  it('has Manekin and Manekina without an element, costing the same', () => {
    const boy = character('Manekin')
    const girl = character('Manekina')
    expect(boy.element).toBeNull()
    expect(girl.element).toBeNull()
    expect(boy.talents).toEqual(girl.talents)
    expect(boy.rarity).toBe(5)
  })

  it('leaves out trial copies, UGC and placeholder avatars', () => {
    const ids = [...planner.characters.values()].map((c) => c.id)
    expect(ids.every((id) => id < 10000900)).toBe(true)
    expect(ids).not.toContain(10000134)
    expect(ids).not.toContain(10000135)
  })
})

describe('levels and EXP', () => {
  it('caps at 90 with the 1-90 EXP total of the game', () => {
    expect(planner.levelCap).toBe(90)
    expect(planner.characterExp.slice(0, 89).reduce((a, b) => a + b, 0)).toBe(8_362_650)
  })

  it('knows the EXP books and ores', () => {
    const exp = (list: typeof planner.expItems.character) =>
      list.map((i) => [i.material.key, i.exp])
    expect(exp(planner.expItems.character)).toEqual([
      ['WanderersAdvice', 1000],
      ['AdventurersExperience', 5000],
      ['HerosWit', 20000],
    ])
    expect(exp(planner.expItems.weapon)).toEqual([
      ['EnhancementOre', 400],
      ['FineEnhancementOre', 2000],
      ['MysticEnhancementOre', 10000],
    ])
    expect(planner.mora.key).toBe('Mora')
  })

  it('caps 1-2 star weapons at 70 and the rest at 90', () => {
    for (const weapon of planner.weapons.values()) {
      expect([weapon.key, weapon.maxLevel]).toEqual([weapon.key, weapon.rarity <= 2 ? 70 : 90])
    }
    expect(planner.weaponExp).toHaveLength(5)
  })

  it('ascends every character through phases capped 20..90', () => {
    for (const c of planner.characters.values()) {
      expect([c.key, c.ascension.map((p) => p.cap)]).toEqual([c.key, [20, 40, 50, 60, 70, 80, 90]])
      expect(c.ascension[0]!.items).toEqual([])
    }
  })
})

describe('materials', () => {
  it('gives every planner material a GOOD key, a name and an icon', () => {
    for (const m of planner.materials.values()) {
      expect(m.key, String(m.id)).toMatch(/^[A-Z0-9][A-Za-z0-9]*$/)
      expect(m.name, m.key).not.toBe('')
      expect(m.icon, m.key).toMatch(/^UI_/)
    }
    expect(planner.materialsByKey.size).toBe(planner.materials.size)
  })

  it('puts every tiered material in a family with rising rarity', () => {
    for (const m of planner.materials.values()) {
      if (!['gem', 'common', 'book', 'weapon', 'elite'].includes(m.kind)) continue
      expect(m.family, m.key).not.toBeNull()
      expect(m.family!.members[m.tier - 1]).toBe(m)
    }
    for (const family of planner.families) {
      const rarities = family.members.map((m) => m.rarity)
      expect(rarities, family.key).toEqual([...rarities].sort((a, b) => a - b))
    }
  })

  it('has domain days for every talent book and weapon material family (weekday coverage)', () => {
    const days = { ...weekdaysJson.talentBooks, ...weekdaysJson.weaponMaterials } as Record<
      string,
      string
    >
    const domainFamilies = planner.families.filter((f) => f.kind === 'book' || f.kind === 'weapon')
    expect(domainFamilies.length).toBeGreaterThanOrEqual(48)
    for (const family of domainFamilies) {
      expect(days[family.key], family.key).toMatch(/^(mon-thu|tue-fri|wed-sat)$/)
      expect(family.weekdays, family.key).toContain(0)
      expect(family.weekdays, family.key).toHaveLength(3)
      expect(family.domain, family.key).toMatch(/^Domain of (Mastery|Forgery): /)
    }
    // Each region has one family per day pair.
    for (const kind of ['book', 'weapon'] as const) {
      const pairs = domainFamilies.filter((f) => f.kind === kind).map((f) => f.weekdays.join())
      const count = (pair: string) => pairs.filter((p) => p === pair).length
      expect(count('1,4,0')).toBe(count('2,5,0'))
      expect(count('2,5,0')).toBe(count('3,6,0'))
    }
  })

  it('knows which tiers can be crafted (3 -> 1)', () => {
    const family = (key: string) => planner.families.find((f) => f.key === key)!
    expect(family('SlimeCondensate').craftMora).toEqual([25, 50])
    expect(family('TeachingsOfFreedom').craftMora).toEqual([175, 550])
    expect(family('BrilliantDiamondSliver').craftMora).toEqual([])
    expect(family('BrilliantDiamondSliver').members.map((m) => m.key)).toEqual([
      'BrilliantDiamondSliver',
      'BrilliantDiamondFragment',
      'BrilliantDiamondChunk',
      'BrilliantDiamondGemstone',
    ])
  })

  it('uses the real icon when it differs from the item id', () => {
    expect(planner.materialsByKey.get('WinterIcelea')!.icon).toBe('UI_ItemIcon_101266')
  })
})
