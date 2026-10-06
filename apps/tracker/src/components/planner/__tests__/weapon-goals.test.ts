import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { createRequirementCache, findWeaponState } from '@gdt/game-data/planner-math'
import type { Good, PlannerTarget } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { overrideId } from '../hand-edits'
import { buildBoard, parseGoalId, targetId, weaponGoalId } from '../model'
import { matchWeaponGoals } from '../seelie-items'
import { assignWeaponCopies } from '../weapon-copies'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)

const copy = (level: number, location = '', refinement = 1) => ({
  key: 'FavoniusSword',
  level,
  ascension: level > 80 ? 6 : level > 70 ? 5 : level > 60 ? 4 : 0,
  refinement,
  location,
  lock: false,
})
const states = (map: ReturnType<typeof assignWeaponCopies>) =>
  Object.fromEntries([...map].map(([id, c]) => [id, c.owned ? c.state.level : 'new']))

describe('weapon goal copies', () => {
  const weapons = [copy(90, 'Bennett'), copy(70), copy(80), copy(50, 'Xingqiu')]

  it('gives one goal the copy findWeaponState would', () => {
    for (const owner of ['Bennett', '', 'Xingqiu', 'Kaeya']) {
      const one = assignWeaponCopies(weapons, [{ id: 'g1', key: 'FavoniusSword', owner }])
      expect(one.get('g1')).toEqual(findWeaponState(weapons, 'FavoniusSword', owner))
    }
    expect(
      assignWeaponCopies([], [{ id: 'g1', key: 'FavoniusSword', owner: '' }]).get('g1'),
    ).toEqual({ state: { level: 1, ascension: 0, refinement: 1 }, owned: false })
  })

  it('never gives one copy to two goals: holders, then spares; the rest start new', () => {
    const goals = [
      { id: 'spare1', key: 'FavoniusSword', owner: '' },
      { id: 'spare2', key: 'FavoniusSword', owner: '' },
      { id: 'bennett', key: 'FavoniusSword', owner: 'Bennett' },
      { id: 'spare3', key: 'FavoniusSword', owner: '' },
      { id: 'spare4', key: 'FavoniusSword', owner: '' },
    ]
    expect(states(assignWeaponCopies(weapons, goals))).toEqual({
      bennett: 90,
      spare1: 80,
      spare2: 70,
      // No spare left: new copies, not Xingqiu's (one goal alone would follow it).
      spare3: 'new',
      spare4: 'new',
    })
  })
})

describe('weapon goals on the board', () => {
  const good: Good = {
    format: 'GOOD',
    version: 3,
    source: 'test',
    characters: [
      {
        key: 'Bennett',
        level: 80,
        constellation: 6,
        ascension: 5,
        talent: { auto: 1, skill: 8, burst: 8 },
      },
    ],
    weapons: [copy(90, 'Bennett'), copy(70)],
    artifacts: [],
    materials: {},
  }
  const sword = { level: 90, ascension: 6, refinement: 1, active: true }
  const targets: PlannerTarget[] = [
    {
      kind: 'character',
      key: 'Bennett',
      owner: '',
      target: { level: 90, ascension: 6, talents: { auto: 1, skill: 9, burst: 9 }, active: true },
      updatedAt: 1,
    },
    {
      kind: 'weapon',
      id: 'fav001',
      key: 'FavoniusSword',
      owner: 'Bennett',
      target: sword,
      updatedAt: 1,
    },
    {
      kind: 'weapon',
      id: 'fav002',
      key: 'FavoniusSword',
      owner: 'Bennett',
      target: sword,
      updatedAt: 1,
    },
    { kind: 'weapon', id: 'fav003', key: 'FavoniusSword', owner: '', target: sword, updatedAt: 1 },
    { kind: 'weapon', id: 'fav004', key: 'FavoniusSword', owner: '', target: sword, updatedAt: 1 },
  ]
  const board = buildBoard(
    planner,
    good,
    {},
    targets,
    createRequirementCache(planner),
    new Map([
      [weaponGoalId('FavoniusSword', '', 'fav004'), { level: 40, ascension: 1, refinement: 2 }],
    ]),
  )

  it('keeps two goals of one weapon apart, each from its own copy', () => {
    const bennett = board.entries.find((e) => e.id === 'character:Bennett')!
    expect(bennett.weapons.map((w) => [w.goalId, w.current.level, w.owned])).toEqual([
      ['fav001', 90, true],
      ['fav002', 70, true],
    ])
    // The spare goals have their own cards; the last one only has its hand-set state.
    const spares = board.entries.filter((e) => e.character === null)
    expect(
      spares.map((e) => [e.weapons[0]!.goalId, e.weapons[0]!.current.level, e.weapons[0]!.edited]),
    ).toEqual([
      ['fav003', 1, false],
      ['fav004', 40, true],
    ])
    expect(new Set(board.goals.map((g) => g.id)).size).toBe(board.goals.length)
  })

  it('names weapon goals by their id, in the URL too', () => {
    const id = weaponGoalId('FavoniusSword', 'Bennett', 'fav002')
    expect(id).toBe('weapon:FavoniusSword:Bennett:fav002')
    expect(targetId(targets[2]!)).toBe(id)
    expect(
      overrideId({ kind: 'weapon', key: 'FavoniusSword', owner: 'Bennett', id: 'fav002' }),
    ).toBe(id)
    expect(parseGoalId(id)).toEqual({ kind: 'weapon', id: 'fav002' })
    expect(parseGoalId('weapon:FavoniusSword::fav003')).toEqual({ kind: 'weapon', id: 'fav003' })
    expect(parseGoalId('weapon:FavoniusSword:Bennett')).toBeNull()
    expect(parseGoalId('custom:cabc123')).toEqual({ kind: 'custom', key: 'cabc123' })
    expect(parseGoalId('character:Hu Tao')).toBeNull()
  })

  it('matches imported weapon goals to stored ones in order, the rest new', () => {
    const stored = targets.flatMap((t) => (t.kind === 'weapon' ? [t] : []))
    expect(
      matchWeaponGoals(
        [
          { key: 'FavoniusSword', owner: 'Bennett' },
          { key: 'FavoniusSword', owner: '' },
          { key: 'FavoniusSword', owner: 'Bennett' },
          { key: 'FavoniusSword', owner: 'Bennett' },
          { key: 'SacrificialSword', owner: '' },
        ],
        stored,
      ),
    ).toEqual(['fav001', 'fav003', 'fav002', null, null])
  })
})
