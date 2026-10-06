import { decodePlanner } from '@gdt/game-data'
import images from '@gdt/game-data/data/images.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import { findCharacterState, findWeaponState } from '@gdt/game-data/planner-math'
import type { Good, PlannerTarget, PlannerTask } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import {
  SEELIE_SECTIONS,
  defaultPicks,
  parseSeelie,
  planSeelie,
  type SeelieAccount,
  type SeeliePicks,
} from '../seelie-plan'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const artifactSets = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)
const NOW = Date.UTC(2026, 9, 6, 12) // Tue Oct 6, 20:00 in Asia

/** A made-up Seelie export (not anyone's real data), one of each thing it can hold. */
const file = {
  goals: [
    {
      type: 'character',
      character: 'hutao',
      cons: 2,
      current: { level: 80, asc: 6 },
      goal: { level: 90, asc: 6 },
      id: 1,
    },
    {
      type: 'talent',
      character: 'hutao',
      normal: { current: 8, goal: 10 },
      skill: { current: 6, goal: 9 },
      burst: { current: 6, goal: 9 },
      id: 2,
    },
    {
      type: 'artifact',
      character: 'hutao',
      artifacts: ['crimson_witch_of_flames'],
      sands: 'hp_p',
      goblet: 'pyro_dmg',
      circlet: 'crit_rate_dmg_p',
      done: { crimson_witch_of_flames: true },
      id: 3,
    },
    {
      type: 'weapon',
      character: 'hutao',
      weapon: 'staff_of_homa',
      current: { level: 80, asc: 6, craft: 2 },
      goal: { level: 90, asc: 6, craft: 2 },
      id: 4,
    },
    {
      type: 'weapon',
      character: 'bennett',
      weapon: 'favonius_sword',
      current: { level: 1, asc: 0 },
      goal: { level: 90, asc: 6, craft: 5 },
      id: 5,
    },
    {
      type: 'weapon',
      character: 'bennett',
      weapon: 'favonius_sword',
      goal: { level: 70, asc: 4 },
      id: 6,
    },
    {
      type: 'artifact',
      character: 'bennett',
      artifacts: ['noblesse_oblige'],
      sands: 'energy_recharge_p',
      id: 7,
    },
    {
      type: 'character',
      character: 'custom-abc123',
      current: { level: 40, asc: 1 },
      goal: { level: 80, asc: 6 },
      id: 8,
    },
  ],
  inactive: {},
  notes: { hutao: 'Butterfly' },
  custom_items: [{ type: 'talent', item: 'freedom', tier: 1, value: 30 }],
  customs: {
    'custom-abc123': {
      custom: 'character',
      name: 'Windy',
      tier: 5,
      element: 'anemo',
      weapon: 'sword',
      element_1: 'vayuda_turqoise',
      element_2: 'maguu_kishin',
      local: 'sea_ganoderma',
      common: 'th_insignia',
      talent: 'diligence',
      boss: 'gilded_scale',
    },
  },
  inventory: [
    { type: 'mora', item: 'mora', tier: 0, value: 1_000_000 },
    { type: 'xp', item: 'xp', tier: 0, value: 120 },
    { type: 'talent', item: 'freedom', tier: 0, value: 9 },
    { type: 'local', item: 'not_a_specialty', tier: 0, value: 3 },
  ],
  tasks: [
    {
      id: 1,
      task: 'Teapot coins',
      recurring: 2,
      notes: null,
      mode: 'original',
      next: '2026-10-07',
    },
    { id: 'abyss', next: '2026-10-16 03:59', done: null },
    { id: 'wish-banner-7-1', next: '2026-10-20 18:00', done: true },
  ],
  resin: { amount: 120, time: 'Tue, 06 Oct 2026 11:00:00 GMT' },
  ar: 58,
  wl: 8,
  server: 'asia',
  gender: 'male',
}

/** The account now: a capture of three characters and two weapons; a few goals and edits. */
const capture: Pick<Good, 'characters' | 'weapons' | 'materials'> = {
  characters: [
    {
      key: 'HuTao',
      level: 80,
      constellation: 1,
      ascension: 5,
      talent: { auto: 6, skill: 6, burst: 6 },
    },
    {
      key: 'Bennett',
      level: 70,
      constellation: 6,
      ascension: 4,
      talent: { auto: 1, skill: 6, burst: 6 },
    },
  ],
  weapons: [
    { key: 'StaffOfHoma', level: 80, ascension: 5, refinement: 1, location: 'HuTao', lock: true },
    {
      key: 'FavoniusSword',
      level: 90,
      ascension: 6,
      refinement: 3,
      location: 'Bennett',
      lock: true,
    },
  ],
  materials: { Mora: 2_000_000, HerosWit: 120, TeachingsOfFreedom: 4 },
} as unknown as Good

const targets: PlannerTarget[] = [
  {
    kind: 'character',
    key: 'HuTao',
    owner: '',
    target: {
      level: 90,
      ascension: 6,
      talents: { auto: 10, skill: 9, burst: 9 },
      active: true,
      favorite: true,
      priority: 1,
    },
    updatedAt: 1,
  },
  {
    kind: 'character',
    key: 'Venti',
    owner: '',
    target: { level: 90, ascension: 6, talents: { auto: 1, skill: 9, burst: 9 }, active: true },
    updatedAt: 1,
  },
  {
    kind: 'weapon',
    id: 'stored1homa',
    key: 'StaffOfHoma',
    owner: 'HuTao',
    target: { level: 90, ascension: 6, refinement: 2, active: true, note: 'R2' },
    updatedAt: 1,
  },
]

const tasks: PlannerTask[] = [
  { kind: 'builtin', id: 'theater', hidden: true, updatedAt: 1 },
  {
    kind: 'custom',
    id: 'mine000001',
    task: { name: 'Fish', every: 7, mode: 'completed' },
    due: '2026-10-08',
    position: 3,
    updatedAt: 1,
  },
]

let ids = 0
const account = (over: Partial<SeelieAccount> = {}): SeelieAccount => ({
  capture,
  bag: { ...capture.materials, HerosWit: 100 },
  targets,
  overrides: new Map(),
  tasks,
  resin: { value: 80, at: Date.UTC(2026, 9, 6, 9), source: 'player' },
  settings: { ar: 60, wl: 8, traveler: 'F' },
  server: 'ASIA',
  newId: () => `new${String(++ids).padStart(6, '0')}`,
  ...over,
})

const parsed = parseSeelie(
  file,
  planner,
  {
    character: (key) => findCharacterState(capture.characters, key).state,
    refinement: (key, owner) => findWeaponState(capture.weapons, key, owner).state.refinement,
    artifactSets,
  },
  'ASIA',
  NOW,
)
const only = (...on: (keyof SeeliePicks)[]): SeeliePicks =>
  Object.fromEntries(SEELIE_SECTIONS.map((s) => [s, on.includes(s)])) as SeeliePicks
const upserts = (plan: ReturnType<typeof planSeelie>) =>
  plan.writes.targets.flatMap((op) => (op.kind === 'upsert' ? [op.input] : []))

describe('Seelie import, section by section', () => {
  it('goals: characters keep the tracker’s own fields, weapons match in order, items come along', () => {
    ids = 0
    const plan = planSeelie(parsed, account(), only('goals'))
    const list = upserts(plan)
    const hutao = list.find((t) => t.kind === 'character' && t.key === 'HuTao')
    expect(hutao?.target).toEqual({
      level: 90,
      ascension: 6,
      talents: { auto: 10, skill: 9, burst: 9 },
      active: true,
      favorite: true,
      priority: 1,
      note: 'Butterfly',
    })
    // Bennett has only weapon and artifact goals: no character goal from the goals alone.
    expect(list.some((t) => t.kind === 'character' && t.key === 'Bennett')).toBe(false)
    const weapons = list.filter((t) => t.kind === 'weapon')
    expect(weapons.map((w) => [w.key, w.owner, w.id, w.target.refinement])).toEqual([
      ['FavoniusSword', 'Bennett', 'new000001', 5],
      ['FavoniusSword', 'Bennett', 'new000002', 3],
    ])
    // The stored Homa goal is the same one (its note kept): nothing to write.
    expect(weapons.some((w) => w.key === 'StaffOfHoma')).toBe(false)
    expect(list.find((t) => t.kind === 'item')).toEqual({
      kind: 'item',
      key: 'GuideToFreedom',
      target: { count: 30, active: true, note: undefined },
    })
    expect(plan.sections.goals).toMatchObject({ total: 5, added: 3, changed: 1, same: 1 })
    expect(plan.writes.current).toEqual([])
    expect(plan.writes.inventory).toEqual([])
    expect(plan.writes.tasks).toEqual([])
    // Replace removes what the file lacks (Venti), not custom characters it isn't writing.
    expect(plan.dropped.map((t) => t.key)).toEqual(['Venti'])
    const replaced = planSeelie(parsed, account(), only('goals'), true)
    expect(replaced.writes.targets[0]).toEqual({
      kind: 'remove',
      ref: { kind: 'character', key: 'Venti' },
    })
  })

  it('artifacts: onto stored goals, and a goal at the current levels for a character without one', () => {
    const plan = planSeelie(parsed, account(), only('artifacts'))
    const list = upserts(plan)
    expect(list.find((t) => t.key === 'HuTao')?.target).toMatchObject({
      level: 90,
      favorite: true,
      artifacts: {
        sets: [{ key: 'CrimsonWitchOfFlames', done: true }],
        sands: ['hp_'],
        goblet: ['pyro_dmg_'],
        circlet: ['critRate_', 'critDMG_'],
      },
    })
    expect(list.find((t) => t.key === 'Bennett')?.target).toEqual({
      level: 70,
      ascension: 4,
      talents: { auto: 1, skill: 6, burst: 6 },
      active: true,
      artifacts: { sets: [{ key: 'NoblesseOblige' }], sands: ['enerRech_'] },
    })
    expect(list.every((t) => t.kind === 'character')).toBe(true)
    expect(plan.sections.artifacts).toMatchObject({ total: 2, added: 2 })
  })

  it('customs: the custom character with its goal and materials', () => {
    const plan = planSeelie(parsed, account(), only('customs'))
    const [custom] = upserts(plan)
    expect(custom).toMatchObject({
      kind: 'custom',
      key: 'abc123',
      target: {
        level: 80,
        ascension: 6,
        custom: {
          name: 'Windy',
          rarity: 5,
          element: 'Anemo',
          weapon: 'sword',
          book: 'TeachingsOfDiligence',
          common: 'TreasureHoarderInsignia',
          boss: 'MarionetteCore',
          local: 'SeaGanoderma',
          weekly: 'GildedScale',
        },
      },
    })
    expect(plan.sections.customs).toMatchObject({ total: 1, added: 1 })
  })

  it('current: hand-set states only where ahead of the capture, on goals that will be there', () => {
    ids = 0
    const plan = planSeelie(parsed, account(), only('goals', 'customs', 'current'))
    expect(plan.writes.current).toEqual([
      // Hu Tao: 80✦ (ascension 6) and talents 8/6/6 beat the capture's 80/5, 6/6/6.
      {
        kind: 'character',
        key: 'HuTao',
        current: { level: 80, ascension: 6, talents: { auto: 8, skill: 6, burst: 6 } },
      },
      {
        kind: 'custom',
        key: 'abc123',
        current: { level: 40, ascension: 1, talents: { auto: 1, skill: 1, burst: 1 } },
      },
      // Homa 80✦ R2 beats the capture's 80 R1; the Favonius at level 1 is behind its copy.
      {
        kind: 'weapon',
        id: 'stored1homa',
        key: 'StaffOfHoma',
        owner: 'HuTao',
        current: { level: 80, ascension: 6, refinement: 2 },
      },
    ])
    // Constellation 2 beats the capture's 1.
    expect(upserts(plan).find((t) => t.key === 'HuTao')?.target).toMatchObject({ constellation: 2 })
    // Without the goals the custom character's state has nowhere to land.
    const alone = planSeelie(parsed, account(), only('current'))
    expect(alone.writes.current.map((c) => c.kind)).toEqual(['character', 'weapon'])
    // Already set by hand: nothing to write.
    const set = planSeelie(
      parsed,
      account({
        overrides: new Map([
          [
            'character:HuTao',
            { level: 80, ascension: 6, talents: { auto: 8, skill: 6, burst: 6 } },
          ],
        ]),
      }),
      only('current'),
    )
    expect(set.writes.current.map((c) => c.kind)).toEqual(['weapon'])
    expect(set.sections.current).toMatchObject({ total: 2, same: 1, added: 1 })
  })

  it('inventory: counts as hand edits on the capture; equal ones are skipped', () => {
    const plan = planSeelie(parsed, account(), only('inventory'))
    expect(plan.writes.inventory).toEqual([
      { key: 'Mora', set: 1_000_000 },
      // The bag has 100 by hand; the file says the capture's 120: back to the capture.
      { key: 'HerosWit', set: null },
      { key: 'TeachingsOfFreedom', set: 9 },
    ])
    expect(plan.sections.inventory).toMatchObject({ total: 3, changed: 3 })
    expect(plan.unmapped).toContain('local/not_a_specialty/0')
  })

  it('tasks: custom ones after ours, permanent ones Seelie has done; events left out', () => {
    const plan = planSeelie(parsed, account(), only('tasks'))
    expect(plan.writes.tasks).toEqual([
      {
        kind: 'custom',
        id: 'seelie1',
        task: { name: 'Teapot coins', every: 2, mode: 'original' },
        due: '2026-10-07',
        position: 4,
      },
      // Done until the 16th's 04:00 (Asia), Seelie's 03:59 read as the reset.
      { kind: 'builtin', id: 'abyss', next: Date.UTC(2026, 9, 15, 20) },
    ])
    expect(plan.sections.tasks).toMatchObject({ total: 2, added: 2 })
    expect(plan.sections.tasks.facts).toEqual(['1 event left out'])
    // The same file again: nothing.
    const again = planSeelie(
      parsed,
      account({
        tasks: [
          ...tasks,
          { ...(plan.writes.tasks[0] as Extract<PlannerTask, { kind: 'custom' }>), updatedAt: 2 },
          { kind: 'builtin', id: 'abyss', next: Date.UTC(2026, 9, 15, 20), updatedAt: 2 },
        ],
      }),
      only('tasks'),
    )
    expect(again.writes.tasks).toEqual([])
    // One of ours by that name (an export of ours read back): that one, not a new one.
    const ours = planSeelie(
      parsed,
      account({
        tasks: [
          ...tasks,
          {
            kind: 'custom',
            id: 'mine000002',
            task: { name: 'teapot coins', every: 3, mode: 'original' },
            due: '2026-10-09',
            position: 1,
            updatedAt: 1,
          },
        ],
      }),
      only('tasks'),
    )
    expect(ours.writes.tasks[0]).toEqual({
      kind: 'custom',
      id: 'mine000002',
      task: { name: 'Teapot coins', every: 2, mode: 'original' },
      due: '2026-10-07',
      position: 1,
    })
  })

  it('resin: only when newer than the reading the tracker has', () => {
    const plan = planSeelie(parsed, account(), only('resin'))
    expect(plan.writes.resin).toEqual({ value: 120, at: Date.UTC(2026, 9, 6, 11) })
    const older = planSeelie(
      parsed,
      account({ resin: { value: 50, at: Date.UTC(2026, 9, 6, 11, 30), source: 'player' } }),
      only('resin'),
    )
    expect(older.writes.resin).toBeUndefined()
    expect(older.sections.resin.facts).toEqual(['older than ours'])
  })

  it('settings: AR, World Level, Traveler and server where they differ', () => {
    const plan = planSeelie(parsed, account(), only('settings'))
    expect(plan.writes.settings).toEqual({ ar: 58 })
    expect(plan.writes.traveler).toBe('M')
    expect(plan.writes.server).toBeUndefined()
    expect(plan.sections.settings.facts).toEqual(['AR 58', 'WL 8', 'Asia', 'Aether'])
  })

  it('ticks the sections with changes, but not settings irminsul or the account already has', () => {
    const plan = planSeelie(parsed, account(), only())
    expect(defaultPicks(plan, { irminsulAr: true, server: 'ASIA' })).toEqual({
      goals: true,
      artifacts: true,
      customs: true,
      current: true,
      inventory: true,
      tasks: true,
      resin: true,
      settings: false,
    })
    expect(defaultPicks(plan, { irminsulAr: false, server: null }).settings).toBe(true)
    // Nothing is written with nothing picked.
    expect(plan.writes).toEqual({
      targets: [],
      current: [],
      inventory: [],
      tasks: [],
      settings: {},
    })
  })
})
