/**
 * The build's own mechanisms, on small made-up inputs: field checks,
 * versions, append-only, key choice. The real data is tested in the other
 * files.
 */

import { describe, expect, it } from 'vitest'
import { toGoodKey } from '../../shared/src/good'
import type { AchievementsFile, PlannerFile } from '../src/format'
import { compileAchievements } from '../scripts/compile/achievements.ts'
import { compileMaterialIndex } from '../scripts/compile/materials.ts'
import { checkAppendOnly } from '../scripts/lib/changes.ts'
import { checkDrops } from '../scripts/lib/drops.ts'
import { checkFields, costs, num, str, TextMap, type Row } from '../scripts/lib/excel.ts'
import { formatJson } from '../scripts/lib/json.ts'
import type { KeysOverride } from '../scripts/lib/overrides.ts'
import { Problems } from '../scripts/lib/problems.ts'
import { compareWithStardb } from '../scripts/lib/stardb.ts'

const noKeys = (): KeysOverride => ({
  characters: { exclude: new Map(), key: new Map() },
  weapons: { include: new Map(), exclude: new Map(), key: new Map() },
  materials: { key: new Map(), prefer: new Map() },
  removed: {
    achievements: new Set(),
    goals: new Set(),
    characters: new Set(),
    weapons: new Set(),
    artifacts: new Set(),
  },
})

describe('excel rows', () => {
  it('reads omitted fields as defaults and skips empty cost slots', () => {
    const row: Row = {
      id: 5,
      costItems: [{ id: 104111, count: 1 }, {}, { count: 2 }, { id: 112038, count: 3 }],
    }
    expect(num(row, 'id')).toBe(5)
    expect(num(row, 'goalId')).toBe(0)
    expect(str(row, 'isShow')).toBe('')
    expect(costs(row, 'costItems')).toEqual([
      { slot: 0, id: 104111, count: 1 },
      { slot: 3, id: 112038, count: 3 },
    ])
    expect(() => num({ id: 'x' }, 'id')).toThrow(/expected a number/)
  })

  it('flags a field that most rows lost (renamed or obfuscated)', () => {
    const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      ABCDEFGHIJK: 1,
      ...(i < 3 ? { goalId: 1 } : {}),
    }))
    const problems = new Problems()
    checkFields(problems, 'Test', rows, { id: 0.99, goalId: 0.2, progress: 1 })
    expect(problems.errors).toHaveLength(2)
    expect(problems.errors[0]).toMatch(/"goalId" is in 3 of 100 rows .* ABCDEFGHIJK/)
    expect(problems.errors[1]).toMatch(/"progress" is in 0 of 100/)
  })

  it('looks text up in several maps', () => {
    const text = new TextMap({ '1': 'one' }, { '2': 'two', '1': 'ignored' })
    expect(text.get(1)).toBe('one')
    expect(text.get(2)).toBe('two')
    expect(text.get(3)).toBeUndefined()
    expect(text.get(undefined)).toBeUndefined()
  })
})

describe('formatJson', () => {
  it('puts outer entries on their own lines and keeps plain arrays inline', () => {
    expect(
      formatJson(
        {
          a: [1, 2],
          rows: [
            [1, 'x'],
            [2, 'y'],
          ],
        },
        2,
      ),
    ).toBe('{\n  "a": [1,2],\n  "rows": [\n    [1,"x"],\n    [2,"y"]\n  ]\n}\n')
    expect(JSON.parse(formatJson({ x: { y: [{ z: 1 }] } }, 3))).toEqual({ x: { y: [{ z: 1 }] } })
  })
})

describe('achievement versions', () => {
  const text = new TextMap({
    '1': 'First',
    '2': 'Do it {param0} times',
    '3': 'Second',
    '4': 'Desc',
    '9': 'Wonders',
  })
  const inputs = {
    achievements: [
      {
        id: 100,
        titleTextMapHash: 1,
        descTextMapHash: 2,
        progress: 40,
        finishRewardId: 1,
        isShow: 'SHOWTYPE_HIDE',
      },
      {
        id: 101,
        titleTextMapHash: 3,
        descTextMapHash: 4,
        progress: 1,
        finishRewardId: 2,
        preStageAchievementId: 100,
      },
      { id: 102, titleTextMapHash: 77, descTextMapHash: 78, progress: 1, isDisuse: true },
    ],
    goals: [{ orderId: 1, nameTextMapHash: 9, iconPath: 'UI_AchievementIcon_O001' }],
    rewards: [
      { rewardId: 1, rewardItemList: [{ itemId: 201, itemCount: 20 }, {}] },
      { rewardId: 2, rewardItemList: [{ itemId: 201, itemCount: 5 }] },
    ],
    text,
  }
  const run = (versions: Map<number, string>, previous?: AchievementsFile) => {
    const problems = new Problems()
    const out = compileAchievements(inputs, { gameVersion: '7.1', versions, previous, problems })
    return { out, problems }
  }

  it('takes the override first, then the first compiled version, then the dump version', () => {
    const previous: AchievementsFile = { columns: [], rows: [[101, 0, 0, 0, 100, 5, 1, '6.0', 0]] }
    const { out, problems } = run(new Map([[100, '4.2']]), previous)
    // Three made-up rows trip the field-presence check; nothing else may fail.
    expect(problems.errors.filter((e) => !e.includes(': field "'))).toEqual([])
    expect(out.achievements.rows).toEqual([
      [100, 0, 0, 1, 0, 20, 40, '4.2', 0],
      [101, 0, 0, 0, 100, 5, 1, '6.0', 0],
      [102, 0, 0, 0, 0, 0, 1, '', 1],
    ])
    expect(run(new Map()).out.achievements.rows[0]![7]).toBe('7.1')
  })

  it('fills {param0}, skips text for disused rows and needs text for active ones', () => {
    const { out } = run(new Map())
    expect(out.text.achievements).toEqual({
      '100': ['First', 'Do it 40 times'],
      '101': ['Second', 'Desc'],
    })
    expect(out.text.goals).toEqual({ '0': 'Wonders' })
    const broken = compileAchievements(
      { ...inputs, achievements: [{ ...inputs.achievements[0]!, titleTextMapHash: 999 }] },
      { gameVersion: '7.1', versions: new Map(), problems: new Problems() },
    )
    expect(broken.achievements.rows).toHaveLength(1)
  })

  it('compiles achievements listed as unobtainable as disused, keeping their version and text', () => {
    const problems = new Problems()
    const out = compileAchievements(inputs, {
      gameVersion: '7.1',
      versions: new Map([[100, '4.2']]),
      unobtainable: new Map([
        [100, 'datamine only'],
        [102, 'already disused'],
        [999, 'gone'],
      ]),
      problems,
    })
    expect(out.achievements.rows[0]).toEqual([100, 0, 0, 1, 0, 20, 40, '4.2', 1])
    expect(out.achievements.rows[1]![8]).toBe(0)
    expect(out.text.achievements['100']).toEqual(['First', 'Do it 40 times'])
    const warnings = problems.warnings.join('\n')
    expect(warnings).toMatch(/lists 102, which the game already marks disused/)
    expect(warnings).toMatch(/lists 999, which is not in the dump/)
  })
})

describe('stardb comparison', () => {
  const achievements = {
    columns: [],
    rows: [
      [1, 0, 0, 0, 0, 5, 1, '1.0', 0],
      [2, 0, 0, 0, 0, 5, 1, '7.1', 0],
      [3, 0, 0, 0, 0, 5, 1, '7.0', 0],
      [4, 0, 0, 0, 0, 5, 1, '1.0', 1],
      [5, 0, 0, 0, 0, 5, 1, '6.0', 1],
    ],
  } as AchievementsFile

  it('names live achievements stardb lacks or flags, and listed ones it now allows', () => {
    const warnings = compareWithStardb(achievements, new Map([[5, 'not yet']]), [
      { id: 1 },
      { id: 3, impossible: true },
      { id: 5, impossible: false },
    ])
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toMatch(/doesn't list achievement\(s\) 2:/)
    expect(warnings[1]).toMatch(/flags achievement\(s\) 3 impossible/)
    expect(warnings[2]).toMatch(/lists 5, which stardb.gg now lists as obtainable/)
  })

  it('is quiet when the data and the list agree', () => {
    const stardb = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 5, impossible: true }]
    expect(compareWithStardb(achievements, new Map([[5, 'not yet']]), stardb)).toEqual([])
  })
})

describe('append-only', () => {
  const previous = {
    achievements: {
      columns: [],
      rows: [
        [1, 0, 0, 0, 0, 5, 1, '1.0', 0],
        [2, 0, 0, 0, 0, 5, 1, '1.0', 0],
      ],
    },
  } as const
  const next = { achievements: { columns: [], rows: [[1, 0, 0, 0, 0, 5, 1, '1.0', 0]] } } as const

  it('fails when a compiled id disappears', () => {
    const problems = new Problems()
    checkAppendOnly(previous as never, next as never, noKeys().removed, problems)
    expect(problems.errors).toHaveLength(1)
    expect(problems.errors[0]).toMatch(
      /achievement ids compiled before are gone: 2\..*removed\.achievements/,
    )
  })

  it('lets an acknowledged removal through', () => {
    const problems = new Problems()
    const removed = noKeys().removed
    removed.achievements.add(2)
    checkAppendOnly(previous as never, next as never, removed, problems)
    expect(problems.errors).toEqual([])
  })
})

describe('material index', () => {
  const names = new TextMap({
    '1': 'Cecilia',
    '2': 'Old Thing',
    '3': '(TEST) Cocktail 1',
    '4': 'Namecard',
    '5': 'Ice',
    '6': 'Basic Tent: "A Nap Beneath the Snow"',
    '7': 'Adventurer Camp',
  })
  const materials: Row[] = [
    {
      id: 339018,
      nameTextMapHash: 1,
      icon: 'UI_Gcg_CardBack_Cecilia',
      materialType: 'MATERIAL_GCG_CARD_BACK',
    },
    { id: 120000, nameTextMapHash: 1, icon: 'UI_ItemIcon_120000', materialType: 'MATERIAL_QUEST' },
    {
      id: 100023,
      nameTextMapHash: 1,
      icon: 'UI_ItemIcon_100023',
      materialType: 'MATERIAL_EXCHANGE',
    },
    { id: 100331, nameTextMapHash: 3, icon: 'UI_ItemIcon_100310', materialType: 'MATERIAL_QUEST' },
    {
      id: 210001,
      nameTextMapHash: 4,
      icon: 'UI_NameCardIcon_1',
      materialType: 'MATERIAL_NAMECARD',
    },
    {
      id: 101268,
      nameTextMapHash: 5,
      icon: 'UI_ItemIcon_101266',
      materialType: 'MATERIAL_EXCHANGE',
    },
    // Furnishing blueprints wait in the bag until used, under the furnishing's name.
    {
      id: 394662,
      nameTextMapHash: 6,
      icon: 'UI_ItemIcon_Home_Common',
      materialType: 'MATERIAL_FURNITURE_FORMULA',
    },
    {
      id: 350001,
      nameTextMapHash: 7,
      icon: 'UI_ItemIcon_Home_Outdoor',
      materialType: 'MATERIAL_FURNITURE_SUITE_FORMULA',
    },
    // A blueprint named like a bag item never takes its key, even with a lower id.
    {
      id: 100001,
      nameTextMapHash: 5,
      icon: 'UI_ItemIcon_Home_Common',
      materialType: 'MATERIAL_FURNITURE_FORMULA',
    },
  ]
  const run = (previous?: Record<string, number>) => {
    const problems = new Problems()
    const out = compileMaterialIndex(materials, names, {
      plannerKeys: new Map(),
      keys: noKeys(),
      toGoodKey,
      previous: previous && { materials: previous },
      problems,
    })
    return { out: out.materials, problems }
  }

  it('picks a bag item over quest copies, TCG card backs and blueprints, and drops test and non-bag items', () => {
    expect(run().out).toEqual({
      AdventurerCamp: [350001, 'UI_ItemIcon_Home_Outdoor'],
      BasicTentANapBeneathTheSnow: [394662, 'UI_ItemIcon_Home_Common'],
      Cecilia: 100023,
      Ice: [101268, 101266],
    })
  })

  it('keeps keys that left the dump, for older snapshots', () => {
    const { out, problems } = run({ OldThing: 100999 })
    expect(out.OldThing).toBe(100999)
    expect(problems.warnings[0]).toMatch(/kept from the previous build/)
  })
})

describe('drop rate checks', () => {
  const planner = {
    domains: [
      [
        10,
        'talent',
        'X',
        ['TeachingsOfX'],
        [
          [25, 20, 1575, 2.2],
          [28, 20, 1800, 2.5],
        ],
      ],
    ],
    families: [['TeachingsOfX', 'book', [1, 2, 3], [175, 550], '', [1, 4, 0]]],
    materials: [[113006, 'TailOfBoreas', 'Tail of Boreas', 5, 'weekly', '']],
    weeklyBosses: [[[113006], 1, 'Andrius', []]],
  } as unknown as PlannerFile
  const source = { page: 'P', url: 'https://w/P?oldid=1', revid: 1, read: '2026-10-04' }

  it('warns when the wiki and the game disagree, or a bracket has no rate', () => {
    const problems = new Problems()
    checkDrops(
      {
        sources: { s: source },
        domains: {
          talent: { sources: ['s'], tiers: [{ tier: 1, perRun: [3.2], firstRoll: 2.5 }] },
        },
        weekly: { solvent: 0.5, sources: ['s'], byWorldLevel: { Nope: [{ wl: 8, perRun: 2 }] } },
      },
      planner,
      { solventPerRun: [0.33] },
      problems,
    )
    expect(problems.errors).toEqual([
      "overrides/drops.json weekly.byWorldLevel.Nope is no weekly trio's first material",
    ])
    expect(problems.warnings).toEqual([
      "overrides/drops.json domains.talent tier 1: the wiki's first roll is 2.5, the game previews 2.2 — the drop rates may have changed; re-check the wiki",
      'overrides/drops.json has no talent domain tier 2 (AR 28): no estimate at that AR',
      'overrides/drops.json weekly.byWorldLevel has no "TailOfBoreas" (Andrius): no estimate for it',
      'overrides/drops.json weekly.solvent is 0.5, the game previews 0.33 Dream Solvent per claim',
    ])
  })

  it('fails on a malformed file', () => {
    const problems = new Problems()
    checkDrops({ domains: { talent: { tiers: 'x' } } }, planner, { solventPerRun: [] }, problems)
    expect(problems.errors).toEqual([
      'overrides/drops.json: domains.talent.sources must list source ids',
      'overrides/drops.json: domains.talent.tiers must be a list of objects',
    ])
  })
})
