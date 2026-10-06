import { decodePlanner } from '@gdt/game-data'
import images from '@gdt/game-data/data/images.json'
import plannerJson from '@gdt/game-data/data/planner.json'
import type { PlannerFile } from '@gdt/game-data/format'
import type { CharacterState, WeaponState } from '@gdt/game-data/planner-math'
import type { CharacterTarget, CustomCharacter, PlannerTarget, PlannerTask } from '@gdt/shared'
import { describe, expect, it } from 'vitest'
import { mapSeelieInventory, mapSeelieItems } from '@/components/planner/seelie-items'
import { isSeelieExport, mapSeelieGoals } from '../seelie'
import { buildSeelieExport, seelieExportFileName, type SeelieExportInput } from '../seelie-export'
import { mapSeelieResin, mapSeelieSettings, mapSeelieTasks } from '../seelie-extras'

const planner = decodePlanner(plannerJson as unknown as PlannerFile)
const artifactSets = Object.keys((images as { artifacts: Record<string, unknown> }).artifacts)

/** Tue 2026-10-06 12:00 UTC. */
const NOW = Date.UTC(2026, 9, 6, 12)

const talents = (auto: number, skill: number, burst: number) => ({ auto, skill, burst })
const character = (key: string, target: CharacterTarget): PlannerTarget => ({
  kind: 'character',
  key,
  owner: '',
  target,
  updatedAt: 0,
})
const weapon = (
  id: string,
  key: string,
  owner: string,
  level: number,
  ascension: number,
  refinement: number,
  active = true,
): PlannerTarget => ({
  kind: 'weapon',
  id,
  key,
  owner,
  target: { level, ascension, refinement, active },
  updatedAt: 0,
})

const windy: CustomCharacter = {
  name: 'Windy',
  rarity: 5,
  element: 'Anemo',
  weapon: 'sword',
  book: 'TeachingsOfDiligence',
  common: 'TreasureHoarderInsignia',
  boss: 'MarionetteCore',
  local: 'SeaGanoderma',
  weekly: 'GildedScale',
}

/** A made-up planner (not anyone's real data). */
const targets: PlannerTarget[] = [
  character('HuTao', {
    level: 90,
    ascension: 6,
    talents: talents(10, 9, 9),
    active: true,
    note: 'C1 first',
    constellation: 1,
    artifacts: {
      sets: [{ key: 'CrimsonWitchOfFlames', done: true }, { key: 'EmblemOfSeveredFate' }],
      sands: ['hp_'],
      goblet: ['pyro_dmg_'],
      circlet: ['critRate_', 'critDMG_'],
    },
  }),
  character('RaidenShogun', { level: 80, ascension: 6, talents: talents(6, 9, 10), active: true }),
  character('KaedeharaKazuha', {
    level: 90,
    ascension: 6,
    talents: talents(1, 8, 8),
    active: false,
    artifacts: { sets: [], sands: ['eleMas'] },
  }),
  character('TravelerAnemo', { level: 70, ascension: 4, talents: talents(6, 6, 6), active: true }),
  {
    kind: 'custom',
    key: 'cwindy1234ab',
    owner: '',
    target: { level: 80, ascension: 6, talents: talents(6, 9, 9), active: true, custom: windy },
    updatedAt: 0,
  },
  weapon('w1aaaa', 'FavoniusSword', 'Bennett', 90, 6, 5),
  weapon('w2bbbb', 'FavoniusSword', 'Bennett', 70, 4, 1, false),
  weapon('w3cccc', 'StaffOfHoma', '', 90, 6, 1),
  weapon('w4dddd', 'EngulfingLightning', 'RaidenShogun', 90, 6, 1),
  weapon('w5eeee', 'FreedomSworn', 'cwindy1234ab', 80, 6, 2),
  {
    kind: 'item',
    key: 'GuideToFreedom',
    owner: '',
    target: { count: 30, active: true },
    updatedAt: 0,
  },
  { kind: 'item', key: 'HerosWit', owner: '', target: { count: 50, active: true }, updatedAt: 0 },
  { kind: 'item', key: 'Mora', owner: '', target: { count: 900_000, active: false }, updatedAt: 0 },
]

const nows: Record<string, CharacterState> = {
  HuTao: { level: 80, ascension: 5, talents: talents(6, 8, 8) },
  RaidenShogun: { level: 70, ascension: 4, talents: talents(1, 6, 6) },
  KaedeharaKazuha: { level: 90, ascension: 6, talents: talents(1, 8, 8) },
  TravelerAnemo: { level: 1, ascension: 0, talents: talents(1, 1, 1) },
  cwindy1234ab: { level: 20, ascension: 1, talents: talents(1, 2, 1) },
}
const weaponNows: Record<string, WeaponState> = {
  w1aaaa: { level: 90, ascension: 6, refinement: 3 },
  w2bbbb: { level: 1, ascension: 0, refinement: 1 },
  w3cccc: { level: 20, ascension: 1, refinement: 1 },
  w4dddd: { level: 90, ascension: 6, refinement: 1 },
  w5eeee: { level: 1, ascension: 0, refinement: 2 },
}
const characterNow = (_: 'character' | 'custom', key: string): CharacterState =>
  nows[key] ?? { level: 1, ascension: 0, talents: talents(1, 1, 1) }

/** The bag: EXP, ores, Mora, Dream Solvent, a crown and the top tier of one family of each kind. */
const bag: Record<string, number> = {
  Mora: 1_234_567,
  HerosWit: 300,
  AdventurersExperience: 20,
  WanderersAdvice: 5,
  MysticEnhancementOre: 100,
  FineEnhancementOre: 3,
  EnhancementOre: 7,
  [planner.items.dreamSolvent]: 4,
  CrownOfInsight: 2,
}
for (const kind of ['book', 'weapon', 'common', 'elite', 'gem', 'boss', 'weekly', 'local']) {
  const family = planner.families.find((f) => f.kind === kind)
  const top =
    family?.members.at(-1) ?? [...planner.materialsByKey.values()].find((m) => m.kind === kind)
  bag[top!.key] = 11
}

const tasks: PlannerTask[] = [
  {
    kind: 'custom',
    id: 'seelie3',
    task: { name: 'Fish', every: 3, mode: 'completed', note: 'rod' },
    due: '2026-10-08',
    position: 0,
    updatedAt: 0,
  },
  {
    kind: 'custom',
    id: 'abcdef12',
    task: { name: 'Own', every: 7, mode: 'original' },
    due: '2026-10-10',
    position: 1,
    updatedAt: 0,
  },
  { kind: 'builtin', id: 'abyss', next: Date.UTC(2026, 9, 15, 20), updatedAt: 0 },
  // No Seelie counterpart, or due anyway: not written.
  { kind: 'builtin', id: 'transformer', next: NOW + 86_400_000, updatedAt: 0 },
  { kind: 'builtin', id: 'commissions', next: NOW - 1, updatedAt: 0 },
]

const input: SeelieExportInput = {
  planner,
  targets,
  characterNow,
  weaponNow: (g) => weaponNows[g.id]!,
  bag,
  tasks,
  resin: { value: 120, at: NOW - 300_000 },
  settings: { ar: 58, wl: 8, traveler: 'M' },
  server: 'ASIA',
  now: NOW,
}

describe('Seelie export', () => {
  const file = buildSeelieExport(input)
  // Through JSON, as the download is.
  const json = JSON.parse(JSON.stringify(file)) as unknown

  it("writes Seelie's account keys only (its achievements and the rest stay)", () => {
    expect(isSeelieExport(json)).toBe(true)
    expect(Object.keys(file).sort()).toEqual(
      [
        'ar',
        'custom_items',
        'customs',
        'gender',
        'goals',
        'inactive',
        'inventory',
        'notes',
        'resin',
        'server',
        'tasks',
        'wl',
      ].sort(),
    )
    expect(file.server).toBe('asia')
    expect(file.gender).toBe('male')
    expect(file.goals.map((g) => g.id)).toEqual(file.goals.map((_, i) => i + 1))
  })

  it('names everything as Seelie does', () => {
    const of = (type: string) => file.goals.filter((g) => g.type === type)
    expect(of('character').map((g) => g.character)).toEqual([
      'hutao',
      'shogun',
      'kazuha',
      'traveler_anemo',
      'custom-cwindy1234ab',
    ])
    expect(of('weapon').map((g) => [g.character, g.weapon])).toEqual([
      ['bennett', 'favonius_sword'],
      ['bennett', 'favonius_sword'],
      [null, 'staff_of_homa'],
      ['shogun', 'grasscutters_light'],
      ['custom-cwindy1234ab', 'freedom-sworn'],
    ])
    expect(of('artifact')).toEqual([
      {
        type: 'artifact',
        id: 3,
        character: 'hutao',
        artifacts: ['crimson_witch_of_flames', 'seal_of_insulation'],
        sands: 'hp_p',
        goblet: 'pyro_dmg',
        circlet: 'crit_rate_dmg_p',
        done: { crimson_witch_of_flames: true },
      },
      expect.objectContaining({ character: 'kazuha', artifacts: [], sands: 'elemental_mastery' }),
    ])
    expect(file.customs).toEqual({
      'custom-cwindy1234ab': {
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
    })
    expect(file.tasks).toEqual([
      { id: 3, task: 'Fish', recurring: 3, notes: 'rod', mode: 'completed', next: '2026-10-08' },
      { id: 4, task: 'Own', recurring: 7, notes: null, mode: 'original', next: '2026-10-10' },
      { id: 'abyss', next: '2026-10-16 04:00', done: null },
    ])
    expect(file.resin).toEqual({ amount: 120, time: 'Tue, 06 Oct 2026 11:55:00 GMT' })
    // A paused item need isn't a need in Seelie.
    expect(file.custom_items).toEqual([
      { type: 'talent', item: 'freedom', tier: 1, value: 30 },
      { type: 'xp', item: 'xp', tier: 0, value: 50 },
    ])
  })

  it('reads back as what it was written from', () => {
    const goals = mapSeelieGoals(json, planner, {
      character: (key) => characterNow('character', key),
      refinement: () => 1,
      artifactSets,
    })
    expect(goals.unmapped).toEqual({ characters: [], weapons: [], artifacts: [], other: [] })

    for (const t of targets) {
      if (t.kind !== 'character') continue
      const back = goals.characters.find((c) => c.key === t.key)!
      const { level, ascension, talents: wanted, active, note, artifacts, constellation } = t.target
      expect(back.target, t.key).toEqual({ level, ascension, talents: wanted, active })
      expect(back.current, t.key).toEqual(nows[t.key])
      expect(back.note).toEqual(note)
      expect(back.artifacts).toEqual(artifacts)
      expect(back.constellation).toBe(constellation ?? 0)
    }
    expect(goals.customs).toEqual([
      {
        key: 'cwindy1234ab',
        custom: windy,
        levelGoal: true,
        target: { level: 80, ascension: 6, talents: talents(6, 9, 9), active: true },
        current: nows.cwindy1234ab,
        constellation: 0,
      },
    ])
    const weapons = targets.flatMap((t) => (t.kind === 'weapon' ? [t] : []))
    expect(goals.weapons).toEqual(
      weapons.map((w) => ({
        key: w.key,
        owner: w.owner,
        target: w.target,
        current: weaponNows[w.id],
      })),
    )

    expect(mapSeelieItems(json, planner)).toEqual({
      items: [
        { key: 'GuideToFreedom', count: 30 },
        { key: 'HerosWit', count: 50 },
      ],
      unmapped: [],
    })
    const inventory = mapSeelieInventory(json, planner)
    expect(inventory.unmapped).toEqual([])
    expect(Object.fromEntries(inventory.items.map((i) => [i.key, i.count]))).toEqual(bag)

    const back = mapSeelieTasks(json, 'ASIA', NOW)
    expect(back.custom.map(({ task, due, position }) => ({ task, due, position }))).toEqual(
      tasks.flatMap((t) =>
        t.kind === 'custom' ? [{ task: t.task, due: t.due, position: t.position }] : [],
      ),
    )
    // A task from Seelie keeps its id; ours got the next number.
    expect(back.custom.map((t) => t.id)).toEqual(['seelie3', 'seelie4'])
    expect(back.builtin).toEqual([{ id: 'abyss', next: Date.UTC(2026, 9, 15, 20) }])
    expect(back.skipped).toEqual([])

    expect(mapSeelieResin(json)).toEqual(input.resin)
    expect(mapSeelieSettings(json)).toEqual({ ar: 58, wl: 8, server: 'ASIA', traveler: 'M' })
  })

  it('leaves out what it does not know and writes an empty resin tracker', () => {
    const bare = buildSeelieExport({
      ...input,
      targets: [],
      bag: { OriginalResin: 120 },
      tasks: [],
      resin: null,
      settings: { ar: null, wl: null, traveler: 'F' },
      server: 'SAR',
    })
    expect(bare).toMatchObject({
      goals: [],
      inventory: [],
      tasks: [],
      resin: { amount: 0, time: null },
      server: 'asia',
      gender: 'female',
    })
    expect('ar' in bare || 'wl' in bare).toBe(false)
    expect(buildSeelieExport({ ...input, server: null }).server).toBeUndefined()
  })

  it('names the file as Seelie does, in local time', () => {
    const at = new Date(2026, 9, 6, 9, 5).getTime()
    expect(seelieExportFileName(at)).toBe('2026-10-06-09-05-main-seelie-gi.json')
  })
})
