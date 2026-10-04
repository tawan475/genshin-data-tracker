import { describe, expect, it } from 'vitest'
import dropsJson from '../overrides/drops.json'
import plannerJson from '../data/planner.json'
import { decodePlanner } from '../src'
import { loadDropRates, parseDropRates } from '../src/drops'
import type { PlannerFile } from '../src/format'
import { ascensionForTalent, TALENT_CAPS } from '../src/planner-math'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

describe('ascension and talent rules from the game data', () => {
  it('talent levels need the ascension TALENT_CAPS says (ProudSkill breakLevel)', () => {
    expect(planner.talentAscension).toEqual([0, 2, 3, 3, 4, 4, 5, 5, 6, 6])
    for (let level = 1; level <= 10; level++) {
      expect(ascensionForTalent(level)).toBe(planner.talentAscension[level - 1])
      expect(TALENT_CAPS[ascensionForTalent(level)]).toBeGreaterThanOrEqual(level)
    }
  })

  it('knows the Adventure Rank of every ascension phase', () => {
    expect(planner.characters.get('HuTao')!.ascension.map((p) => p.ar)).toEqual([
      0, 15, 25, 30, 35, 40, 50,
    ])
    expect(planner.weapons.get('StaffOfHoma')!.ascension.map((p) => p.ar)).toEqual([
      0, 15, 25, 30, 35, 40, 50,
    ])
    expect(planner.weapons.get('SilverSword')!.ascension.map((p) => p.ar)).toEqual([
      0, 15, 25, 30, 35,
    ])
  })

  it('knows which talent constellations 3 and 5 raise', () => {
    const boosts = (key: string) => planner.characters.get(key)!.constellation
    expect(boosts('Neuvillette')).toEqual({ c3: 'auto', c5: 'burst' })
    expect(boosts('RaidenShogun')).toEqual({ c3: 'burst', c5: 'skill' })
    expect(boosts('HuTao')).toEqual({ c3: 'skill', c5: 'burst' })
    expect(boosts('TravelerGeo')).toEqual({ c3: 'burst', c5: 'skill' })
    expect(boosts('Aloy')).toEqual({ c3: null, c5: null })
    const missing = [...planner.characters.values()].filter((c) => !c.constellation.c3)
    expect(missing.map((c) => c.key).sort()).toEqual(['Aloy', 'Manekin', 'Manekina'])
  })
})

describe('domains', () => {
  it('has every talent book and weapon material family in exactly one entrance', () => {
    expect(planner.domains).toHaveLength(16)
    const seen = new Map<string, number>()
    for (const d of planner.domains) {
      expect(d.families, d.name).toHaveLength(3)
      expect(d.name, String(d.entry)).not.toBe('')
      for (const f of d.families) seen.set(f.key, (seen.get(f.key) ?? 0) + 1)
    }
    for (const family of planner.families.filter((f) => f.kind === 'book' || f.kind === 'weapon')) {
      expect([family.key, seen.get(family.key)]).toEqual([family.key, 1])
      expect(planner.domainOf.get(family.key)!.kind).toBe(
        family.kind === 'book' ? 'talent' : 'weapon',
      )
    }
  })

  it('lists the families in day order (Mon/Thu, Tue/Fri, Wed/Sat)', () => {
    const rift = planner.domains.find((d) => d.name === 'Forsaken Rift')!
    expect(rift.kind).toBe('talent')
    expect(rift.families.map((f) => f.key)).toEqual([
      'TeachingsOfFreedom',
      'TeachingsOfResistance',
      'TeachingsOfBallad',
    ])
    for (const d of planner.domains) {
      expect(d.families.map((f) => f.weekdays.join())).toEqual(['1,4,0', '2,5,0', '3,6,0'])
    }
  })

  it('knows each tier: AR, 20 resin, Mora per run', () => {
    const talent = planner.domains.find((d) => d.kind === 'talent')!.tiers
    expect(talent.map((t) => [t.tier, t.ar, t.resin, t.mora])).toEqual([
      [1, 25, 20, 1575],
      [2, 28, 20, 1800],
      [3, 36, 20, 2050],
      [4, 45, 20, 2375],
    ])
    const weapon = planner.domains.find((d) => d.kind === 'weapon')!.tiers
    expect(weapon.map((t) => [t.ar, t.mora])).toEqual([
      [15, 1125],
      [21, 1550],
      [30, 1850],
      [40, 2200],
    ])
    for (const d of planner.domains) expect(d.tiers).toEqual(d.kind === 'talent' ? talent : weapon)
  })
})

describe('weekly bosses and conversions', () => {
  it('puts every weekly material in one boss trio, or marks it unfarmable', () => {
    expect(planner.weeklyBosses).toHaveLength(14)
    const weekly = [...planner.materials.values()].filter((m) => m.kind === 'weekly')
    for (const m of weekly) {
      const boss = planner.weeklyBossOf.get(m.key)
      expect([m.key, Boolean(boss) !== planner.unfarmable.has(m.key)]).toEqual([m.key, true])
    }
    expect([...planner.unfarmable]).toEqual(['TheCornerstoneOfStarsAndFlames'])
  })

  it('names the bosses and the levels that drop their trio', () => {
    const dvalin = planner.weeklyBossOf.get('DvalinsSigh')!
    expect(dvalin.name).toBe('Stormterror')
    expect(dvalin.items.map((m) => m.key)).toEqual(['DvalinsPlume', 'DvalinsClaw', 'DvalinsSigh'])
    expect(dvalin.solvent).toBe(1)
    expect(dvalin.tiers).toEqual([
      { ar: 40, level: 70 },
      { ar: 45, level: 80 },
      { ar: 50, level: 90 },
    ])
    expect(planner.weeklyBossOf.get('ShardOfAFoulLegacy')!.name).toBe('Childe')
    const andrius = planner.weeklyBossOf.get('TailOfBoreas')!
    expect(andrius.name).toBe('Andrius')
    expect(andrius.tiers).toEqual([])
    for (const boss of planner.weeklyBosses) expect(boss.name).not.toBe('')
  })

  it('keeps billet trios apart (2 solvent each)', () => {
    expect(planner.billets).toHaveLength(5)
    for (const b of planner.billets) {
      expect(b.items).toHaveLength(3)
      expect(b.solvent).toBe(2)
    }
  })

  it('converts gems with Dust of Azoth: 1/3/9/27 per tier, never Brilliant Diamond', () => {
    expect(planner.azoth.dust).toEqual([1, 3, 9, 27])
    expect(planner.azoth.families.size).toBe(7)
    expect(planner.azoth.families.has('AgnidusAgateSliver')).toBe(true)
    expect(planner.azoth.families.has('BrilliantDiamondSliver')).toBe(false)
  })

  it('has Dream Solvent and Dust of Azoth as planner materials', () => {
    expect(planner.items).toEqual({ dreamSolvent: 'DreamSolvent', dustOfAzoth: 'DustOfAzoth' })
    for (const key of ['DreamSolvent', 'DustOfAzoth']) {
      expect(planner.materialsByKey.get(key)).toMatchObject({ key, kind: 'currency' })
    }
  })
})

describe('forging, resin, passives', () => {
  it('forges Mystic Enhancement Ore from 4 chunks for 50 Mora in 3 minutes', () => {
    const mystic = planner.forge.filter((r) => r.ore === 'MysticEnhancementOre')
    expect(mystic.map((r) => r.input).sort()).toEqual([
      'AmethystLump',
      'CondessenceCrystal',
      'CrystalChunk',
      'RainbowdropCrystal',
    ])
    for (const r of mystic) expect([r.count, r.mora, r.seconds]).toEqual([4, 50, 180])
    expect(planner.weaponBaseExp.slice(0, 3)).toEqual([600, 1200, 1800])
  })

  it('knows the resin items and the ley line cost', () => {
    expect(planner.resin.original).toBe('OriginalResin')
    expect(planner.resin.items).toEqual([
      { key: 'CondensedResin', resin: 60 },
      { key: 'FragileResin', resin: 60 },
      { key: 'TransientResin', resin: 60 },
    ])
    expect(planner.resin.condensed).toEqual({ key: 'CondensedResin', max: 5 })
    expect(planner.resin.leyLine).toBe(20)
  })

  it('knows the weapon ascension Mora passives', () => {
    expect(planner.passives.ascensionMora).toEqual([
      { character: 'RaidenShogun', types: ['sword', 'polearm'], saved: 0.5 },
      { character: 'Wanderer', types: ['catalyst', 'bow'], saved: 0.5 },
    ])
    expect(planner.passives.crafting).toContainEqual({
      character: 'KamisatoAyaka',
      kind: 'weapon',
      effect: 'double',
      chance: 0.1,
      share: 1,
    })
  })
})

describe('drop rates (overrides/drops.json, Genshin Impact Wiki)', () => {
  const { rates, problems } = parseDropRates(dropsJson)

  it('parses without problems and cites a wiki revision for every section', () => {
    expect(problems).toEqual([])
    for (const source of rates.sources.values()) {
      expect(source.url).toMatch(/^https:\/\/genshin-impact\.fandom\.com\/wiki\/.+\?oldid=\d+$/)
      expect(source.url).toContain(`oldid=${source.revid}`)
      expect(source.read).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    for (const cited of [
      rates.domains.talent.sources,
      rates.domains.weapon.sources,
      rates.bosses.sources,
      rates.weekly.sources,
      rates.leyLines.sources,
    ]) {
      expect(cited.length).toBeGreaterThan(0)
    }
  })

  it('has a rate for every domain tier; its first roll is what the game previews', () => {
    for (const domain of [planner.domains[0]!, planner.domains.find((d) => d.kind === 'talent')!]) {
      for (const tier of domain.tiers) {
        const rate = rates.domains[domain.kind].tiers.get(tier.tier)!
        expect(rate.firstRoll, `${domain.kind} ${tier.tier}`).toBeCloseTo(tier.preview, 5)
        expect(rate.perRun[0]).toBeGreaterThanOrEqual(rate.firstRoll!)
      }
    }
    expect(rates.domains.talent.tiers.get(4)!.perRun).toEqual([2.2, 1.98, 0.22])
    expect(rates.domains.weapon.tiers.get(4)!.perRun).toEqual([2.2, 2.418, 0.62, 0.062])
  })

  it('has weekly rates for every boss level that drops a trio, and resin costs', () => {
    const levels = new Set(planner.weeklyBosses.flatMap((b) => b.tiers.map((t) => t.level)))
    for (const level of levels) expect(rates.weekly.byLevel.has(level), String(level)).toBe(true)
    expect(rates.weekly.byWorldLevel.get('TailOfBoreas')?.get(8)).toBe(2.4)
    expect([rates.weekly.resin, rates.weekly.discountResin, rates.weekly.discounts]).toEqual([
      60, 30, 3,
    ])
    expect(rates.weekly.solvent).toBe(0.33)
    expect(rates.bosses.resin).toBe(40)
  })

  it('leaves out what the wiki doesn’t give (World Level 9 bosses)', () => {
    expect(rates.bosses.byWorldLevel.has(9)).toBe(false)
    expect(rates.leyLines.byWorldLevel.get(9)).toEqual({ wl: 9, exp: 122500, mora: 60000 })
  })

  it('reports malformed entries instead of guessing', () => {
    const bad = parseDropRates({
      sources: { a: { page: 'P', url: 'https://x', read: 'today' } },
      domains: { talent: { sources: ['a', 'b'], tiers: [{ tier: 1, perRun: [-1] }] } },
      oops: {},
    })
    expect(bad.problems).toEqual([
      'unknown section "oops" (expected sources, domains, bosses, weekly, leyLines)',
      'sources.a.read must be the date read (YYYY-MM-DD)',
      'sources.a needs a "revid" (or an oldid permalink) so it can be re-checked',
      'domains.talent.sources: "b" is not in sources',
      'domains.talent.tiers[0].perRun must be 1-3 averages (numbers ≥ 0)',
    ])
    expect(bad.rates.domains.talent.tiers.size).toBe(0)
  })

  it('loads through loadDropRates', async () => {
    const loaded = await loadDropRates()
    expect(loaded.domains.talent.tiers.size).toBe(4)
  })
})
