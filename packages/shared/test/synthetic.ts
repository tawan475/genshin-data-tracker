/**
 * Deterministic synthetic GOOD files for storage tests: an account-sized
 * inventory (keys from the public dictionaries, values made up) and a run of
 * later captures that change it the way play does. Real exports are personal
 * data and never committed; see GDT_GOOD_SAMPLES_DIR in codec.test.ts.
 */

import { CHARACTERS, WEAPONS, type Good, type GoodArtifact } from '../src'
import { ARTIFACT_SETS, SLOT_KEYS, STAT_KEYS, SUBSTAT_KEYS } from '../src/dictionary/artifacts'
import { MATERIALS } from '../src/dictionary/materials'

/** mulberry32: small, fast, good enough for test data. */
export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]!
export const int = (rand: () => number, min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1))

const ROLLS: Record<string, number[]> = {
  hp: [209.13, 239, 268.88, 298.75],
  hp_: [4.08, 4.66, 5.25, 5.83],
  atk: [13.62, 15.56, 17.51, 19.45],
  atk_: [4.08, 4.66, 5.25, 5.83],
  def: [16.2, 18.52, 20.83, 23.15],
  def_: [5.1, 5.83, 6.56, 7.29],
  eleMas: [16.32, 18.65, 20.98, 23.31],
  enerRech_: [4.53, 5.18, 5.83, 6.48],
  critRate_: [2.72, 3.11, 3.5, 3.89],
  critDMG_: [5.44, 6.22, 6.99, 7.77],
}
const round1 = (n: number) => Math.round(n * 10) / 10

export function syntheticArtifact(rand: () => number, level = 0): GoodArtifact {
  const keys = [...SUBSTAT_KEYS].sort(() => rand() - 0.5).slice(0, 4)
  const start = rand() < 0.5 ? 3 : 4
  const substats = keys.slice(0, start).map((key) => {
    const value = round1(pick(rand, ROLLS[key]!))
    return { key, value, initialValue: value }
  })
  const unactivatedSubstats = keys.slice(start).map((key) => {
    const value = round1(pick(rand, ROLLS[key]!))
    return { key, value, initialValue: value }
  })
  const artifact: GoodArtifact = {
    setKey: pick(rand, ARTIFACT_SETS),
    slotKey: pick(rand, SLOT_KEYS),
    level: 0,
    rarity: 5,
    mainStatKey: pick(rand, STAT_KEYS),
    location: '',
    lock: rand() < 0.7,
    substats,
    totalRolls: start,
    astralMark: rand() < 0.05,
    elixerCrafted: false,
    unactivatedSubstats,
  }
  return levelUp(rand, artifact, level)
}

/** The artifact after levelling to `level` (a roll every 4 levels). */
export function levelUp(rand: () => number, a: GoodArtifact, level: number): GoodArtifact {
  const out: GoodArtifact = {
    ...a,
    substats: a.substats.map((s) => ({ ...s })),
    unactivatedSubstats: (a.unactivatedSubstats ?? []).map((s) => ({ ...s })),
  }
  for (let l = Math.floor(a.level / 4) + 1; l <= Math.floor(level / 4); l++) {
    const waiting = out.unactivatedSubstats!.shift()
    if (waiting) out.substats.push(waiting)
    else {
      const s = pick(rand, out.substats)
      s.value = round1(s.value + pick(rand, ROLLS[s.key]!))
    }
    out.totalRolls = (out.totalRolls ?? 0) + 1
  }
  out.level = level
  return out
}

export function syntheticGood(seed = 1): Good {
  const rand = random(seed)
  const characters = CHARACTERS.keys
    .filter(() => rand() < 0.8)
    .map((key) => ({
      key,
      level: pick(rand, [1, 20, 40, 50, 60, 70, 80, 90, 90, 90]),
      constellation: int(rand, 0, 6),
      ascension: int(rand, 0, 6),
      talent: { auto: int(rand, 1, 10), skill: int(rand, 1, 10), burst: int(rand, 1, 10) },
    }))
  const owners = characters.map((c) => c.key)
  const weapons = Array.from({ length: 400 }, () => ({
    key: pick(rand, WEAPONS.keys),
    level: pick(rand, [1, 1, 1, 20, 40, 50, 60, 70, 80, 90]),
    ascension: int(rand, 0, 6),
    refinement: int(rand, 1, 5),
    location: rand() < 0.2 ? pick(rand, owners) : '',
    lock: rand() < 0.4,
  }))
  const artifacts = Array.from({ length: 1500 }, () => {
    const a = syntheticArtifact(rand, pick(rand, [0, 0, 0, 4, 8, 12, 16, 20, 20]))
    if (rand() < 0.25) a.location = pick(rand, owners)
    return a
  })
  const materials: Record<string, number> = {}
  for (const key of MATERIALS.keys) if (rand() < 0.2) materials[key] = int(rand, 1, 3000)
  materials.Mora = 12_345_678
  materials.Primogem = 16_000
  const achievements = Array.from({ length: 1500 }, (_, i) => 80000 + i * 3 + int(rand, 0, 2))
  let at = 1_610_000_000
  const times: Record<string, number> = {}
  for (const id of achievements) {
    at += rand() < 0.7 ? int(rand, 1, 600) : int(rand, 3600, 2_000_000)
    times[String(id)] = at
  }
  const extras: Record<string, { friendship?: number; obtainedAt?: number }> = {}
  for (const key of owners) {
    extras[key] = { friendship: int(rand, 1, 10), obtainedAt: 1_601_000_000 + int(rand, 0, 1e8) }
  }
  return {
    format: 'GOOD',
    version: 3,
    source: 'Irminsul',
    characters,
    artifacts,
    weapons,
    materials,
    gi_achievements: achievements,
    timestamp: 1_790_000_000_000,
    gi_player: {
      uid: 812345678,
      ar: 60,
      arExp: 0,
      wl: 8,
      wlLimit: 9,
      resin: 120,
      storyKeys: 3,
      maxStamina: 24000,
      gameData: '792978e5503ecfba73dcb3562ed44a0d35a2abe2',
    },
    gi_achievement_times: times,
    gi_characters: extras,
  }
}

/**
 * The next capture: some materials used or gained, a few artifacts levelled
 * or dropped or new, now and then a character or weapon levelled, an
 * achievement done, resin moved. `step` makes each capture different.
 */
export function playOn(good: Good, step: number): Good {
  const rand = random(10_000 + step)
  const materials = { ...good.materials }
  const keys = Object.keys(materials)
  for (let i = 0; i < int(rand, 2, 12); i++) {
    const key = pick(rand, keys)
    materials[key] = Math.max(0, materials[key]! + int(rand, -30, 60))
  }
  materials.Mora = materials.Mora! + int(rand, -200_000, 300_000)
  if (rand() < 0.1) materials[pick(rand, MATERIALS.keys)] = int(rand, 1, 20)

  let artifacts = good.artifacts
  if (rand() < 0.6) {
    artifacts = artifacts.map((a) =>
      rand() < 0.002 && a.level < 20 ? levelUp(rand, a, Math.min(20, a.level + 4)) : a,
    )
    for (let i = 0; i < int(rand, 0, 4); i++) artifacts.push(syntheticArtifact(rand))
    if (rand() < 0.3) artifacts = artifacts.filter(() => rand() > 0.002)
  }
  if (rand() < 0.3) {
    artifacts = artifacts.map((a) => (rand() < 0.01 ? { ...a, lock: !a.lock } : a))
  }

  let characters = good.characters
  if (rand() < 0.15) {
    characters = characters.map((c) =>
      rand() < 0.05 ? { ...c, level: Math.min(90, c.level + 10) } : c,
    )
  }
  let weapons = good.weapons
  if (rand() < 0.1) {
    weapons = weapons.map((w) => (rand() < 0.02 ? { ...w, level: Math.min(90, w.level + 10) } : w))
  }

  let achievements = good.gi_achievements ?? []
  let times = good.gi_achievement_times ?? {}
  if (rand() < 0.2) {
    const id = 90000 + step
    achievements = [...achievements, id]
    times = { ...times, [String(id)]: 1_790_000_000 + step * 3600 }
  }
  const extras = good.gi_characters ?? {}
  return {
    ...good,
    artifacts,
    characters,
    weapons,
    materials,
    gi_achievements: achievements,
    gi_achievement_times: times,
    gi_characters:
      rand() < 0.1
        ? Object.fromEntries(
            Object.entries(extras).map(([k, v]) => [
              k,
              rand() < 0.05 ? { ...v, friendship: Math.min(10, (v.friendship ?? 1) + 1) } : v,
            ]),
          )
        : extras,
    gi_player: { ...good.gi_player!, resin: int(rand, 0, 200) },
    timestamp: (good.timestamp ?? 0) + 3_600_000,
  }
}
