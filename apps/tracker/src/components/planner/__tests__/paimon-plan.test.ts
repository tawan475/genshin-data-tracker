import { decodePlanner } from '@gdt/game-data'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { NEW_CHARACTER } from '@gdt/game-data/planner-math'
import { describe, expect, it } from 'vitest'
import {
  isPaimonBackup,
  paimonAccounts,
  paimonSettings,
  paimonTodos,
  pickPaimonAccount,
} from '@/data/paimon-backup'
import { parsePaimon, todoLevel } from '../paimon-plan'
import { SEELIE_SECTIONS, planSeelie, type SeeliePicks } from '../seelie-plan'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const hutao = planner.characters.get('HuTao')!
const homa = planner.weapons.get('StaffOfHoma')!

/** A GOOD key as paimon.moe spells its ids ("HerosWit" -> "heros_wit"). */
const paimonId = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/** What reaching phases (from, to] asks for, by paimon.moe id. */
function phaseItems(phases: typeof hutao.ascension, from: number, to: number) {
  const out: Record<string, number> = {}
  for (const phase of phases.slice(from + 1, to + 1)) {
    for (const i of phase.items) {
      const id = paimonId(i.material.key)
      out[id] = (out[id] ?? 0) + i.count
    }
  }
  return out
}
const byKey = (phases: typeof hutao.ascension, from: number, to: number) => {
  const out = new Map<string, number>()
  for (const phase of phases.slice(from + 1, to + 1))
    for (const i of phase.items) out.set(i.material.key, (out.get(i.material.key) ?? 0) + i.count)
  return out
}

describe('todoLevel', () => {
  const talentKeys = new Set(
    Object.values(hutao.talents).flatMap((levels) =>
      levels.flatMap((l) => l.items.map((i) => i.material.key)),
    ),
  )
  it('tells an ascended goal at a level cap by its ascension materials', () => {
    const todo = { from: 40, to: 80 }
    expect(todoLevel(hutao.ascension, todo, byKey(hutao.ascension, 1, 6), talentKeys)).toEqual({
      level: 80,
      ascension: 6,
    })
    expect(todoLevel(hutao.ascension, todo, byKey(hutao.ascension, 1, 5), talentKeys)).toEqual({
      level: 80,
      ascension: 5,
    })
    // An ascended start: 40✦ (phase 2) to 80✦.
    expect(todoLevel(hutao.ascension, todo, byKey(hutao.ascension, 2, 6), talentKeys)).toEqual({
      level: 80,
      ascension: 6,
    })
  })

  it('takes the lowest ascension when nothing matches, and between caps the only one', () => {
    expect(todoLevel(hutao.ascension, { from: 1, to: 80 }, new Map(), talentKeys)).toEqual({
      level: 80,
      ascension: 5,
    })
    expect(todoLevel(hutao.ascension, { from: 1, to: 85 }, new Map(), talentKeys)).toEqual({
      level: 85,
      ascension: 6,
    })
    expect(todoLevel(homa.ascension, { from: 1, to: 90 }, new Map())).toEqual({
      level: 90,
      ascension: 6,
    })
  })

  it('reads weapon ascension the same way', () => {
    expect(todoLevel(homa.ascension, { from: 20, to: 60 }, byKey(homa.ascension, 0, 4))).toEqual({
      level: 60,
      ascension: 4,
    })
  })
})

/** A made-up paimon.moe backup (nobody's real data): two accounts. */
const backup = {
  accounts: 'account2',
  'wish-uid': '812345678',
  ar: 58,
  wl: '8',
  server: 'Europe',
  todos: [
    {
      type: 'character',
      character: { id: 'hu_tao', name: 'Hu Tao' },
      level: { from: 40, to: 80 },
      resources: { mora: 10 },
      original: { mora: 400000, ...phaseItems(hutao.ascension, 1, 6) },
    },
    {
      type: 'character',
      character: { id: 'hu_tao', name: 'Hu Tao' },
      level: { from: 1, to: 50 },
      resources: {},
      original: {},
    },
    {
      type: 'weapon',
      weapon: { id: 'staff_of_homa' },
      level: { from: 1, to: 90 },
      resources: {},
      original: {},
    },
    {
      type: 'character',
      character: { id: 'nobody_at_all' },
      level: { from: 1, to: 90 },
      resources: {},
    },
    { type: 'character', character: null, level: { from: 1, to: 90 }, resources: {} },
    { type: 'item', resources: { heros_wit: 30, mora: 1000, not_an_item: 2 } },
    { type: 'item', resources: { heros_wit: 5 } },
  ],
  'account2-wish-uid': '812345679',
  'account2-todos': [],
  'account2-ar': 30,
}

describe('paimon.moe backup', () => {
  it('finds accounts, and the one to read', () => {
    expect(isPaimonBackup(backup)).toBe(true)
    expect(isPaimonBackup({ goals: [] })).toBe(false)
    expect(isPaimonBackup({ format: 'GOOD', characters: [] })).toBe(false)
    const accounts = paimonAccounts(backup)
    expect(accounts.map((a) => [a.prefix, a.value, a.uid])).toEqual([
      ['', 'main', '812345678'],
      ['account2-', 'account2', '812345679'],
    ])
    expect(pickPaimonAccount(accounts, '812345679')).toBe(1)
    expect(pickPaimonAccount(accounts, '800000000')).toBe(0)
    expect(pickPaimonAccount(accounts, null, (a) => a.prefix !== '')).toBe(1)
  })

  it('reads the to-do list and the settings', () => {
    const todos = paimonTodos(backup, '')
    expect(todos.levels.map((t) => [t.type, t.id, t.from, t.to])).toEqual([
      ['character', 'hu_tao', 40, 80],
      ['character', 'hu_tao', 1, 50],
      ['weapon', 'staff_of_homa', 1, 90],
      ['character', 'nobody_at_all', 1, 90],
    ])
    expect(todos.items).toEqual({ heros_wit: 35, mora: 1000, not_an_item: 2 })
    expect(todos.anonymous).toBe(1)
    expect(paimonSettings(backup, '')).toEqual({ ar: 58, wl: 8, server: 'EUROPE' })
    expect(paimonSettings(backup, 'account2-')).toEqual({ ar: 30 })
    expect(paimonTodos({}, '')).toEqual({ levels: [], items: {}, anonymous: 0 })
  })

  it('maps to goals: the highest per character, talents kept', () => {
    const parsed = parsePaimon(backup, '', planner, {
      character: () => NEW_CHARACTER,
      refinement: () => 3,
      goalTalents: (key) => (key === 'HuTao' ? { auto: 10, skill: 9, burst: 9 } : null),
    })
    expect(parsed.goals.characters).toEqual([
      {
        key: 'HuTao',
        levelGoal: true,
        target: {
          level: 80,
          ascension: 6,
          talents: { auto: 10, skill: 9, burst: 9 },
          active: true,
        },
      },
    ])
    expect(parsed.goals.weapons).toEqual([
      {
        key: 'StaffOfHoma',
        owner: '',
        target: { level: 90, ascension: 6, refinement: 3, active: true },
      },
    ])
    expect(parsed.items.items).toEqual([
      { key: 'HerosWit', count: 35 },
      { key: planner.mora.key, count: 1000 },
    ])
    expect(parsed.goals.unmapped.characters).toEqual(['nobody_at_all'])
    expect(parsed.items.unmapped).toEqual(['not_an_item'])
    expect(parsed.settings).toEqual({ ar: 58, wl: 8, server: 'EUROPE' })
  })

  it('plans like a Seelie import, each section opt-in', () => {
    const parsed = parsePaimon(backup, '', planner, {
      character: () => NEW_CHARACTER,
      refinement: () => 1,
      goalTalents: () => null,
    })
    let id = 0
    const account = {
      capture: { characters: [], weapons: [], materials: {} },
      bag: {},
      targets: [],
      overrides: new Map(),
      tasks: [],
      resin: null,
      settings: { ar: 60, wl: 8, traveler: 'F' as const },
      server: null,
      newId: () => `paimon${++id}`,
    }
    const all = Object.fromEntries(SEELIE_SECTIONS.map((s) => [s, true])) as SeeliePicks
    const plan = planSeelie(parsed, account, all)
    expect(plan.sections.goals).toMatchObject({ total: 4, added: 4 })
    expect(plan.writes.targets.map((op) => op.kind === 'upsert' && op.input.kind)).toEqual([
      'character',
      'weapon',
      'item',
      'item',
    ])
    expect(plan.writes.settings).toEqual({ ar: 58 })
    expect(plan.writes.server).toBe('EUROPE')
    expect(plan.unmapped).toEqual(['nobody_at_all', 'not_an_item'])
    const none = planSeelie(parsed, account, { ...all, goals: false, settings: false })
    expect(none.writes.targets).toEqual([])
  })
})
