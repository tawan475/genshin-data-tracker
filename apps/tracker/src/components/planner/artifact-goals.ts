/**
 * Artifact goals (Seelie's Artifacts tab), pure: per character the sets
 * wanted (any of them), the main stats wanted on Sands, Goblet and Circlet
 * (any of them), and a tick per slot and per set. We do better than Seelie
 * by ticking from the capture:
 *
 * - A slot is done when the character wears a piece there that is levelled
 *   to the top for its rarity (+20 on a 5★), has a chosen main stat (any,
 *   when none is chosen) and is of a chosen set (any, when none is). The
 *   fifth slot is free once the other four are of chosen sets (a 4-piece,
 *   or 2 + 2, plus an off-piece).
 * - A set is done when every slot is (the build is finished; the other
 *   sets were alternatives).
 * - A tick by hand wins over the capture both ways (`true` done, `false`
 *   not done); clearing it goes back to the capture.
 *
 * No material cost: artifact goals never count in the totals.
 */

import { ARTIFACT_SLOT_KEYS, type ArtifactGoal, type ArtifactSlotKey } from '@gdt/shared'
import type { GoodArtifact } from '@gdt/shared'
import { maxLevel } from '@/utils/artifact-rolls'

export const ARTIFACT_SLOTS = ARTIFACT_SLOT_KEYS
export type ArtifactSlot = ArtifactSlotKey
/** Slots whose main stat can be chosen. */
export type StatSlot = 'sands' | 'goblet' | 'circlet'
export const STAT_SLOTS: readonly StatSlot[] = ['sands', 'goblet', 'circlet']

/** Main stats each slot can roll, in the order the picker shows them. */
export const MAIN_STAT_CHOICES: Readonly<Record<StatSlot, readonly string[]>> = {
  sands: ['atk_', 'hp_', 'def_', 'eleMas', 'enerRech_'],
  goblet: [
    'atk_',
    'hp_',
    'def_',
    'eleMas',
    'pyro_dmg_',
    'hydro_dmg_',
    'electro_dmg_',
    'cryo_dmg_',
    'anemo_dmg_',
    'geo_dmg_',
    'dendro_dmg_',
    'physical_dmg_',
  ],
  circlet: ['critRate_', 'critDMG_', 'atk_', 'hp_', 'def_', 'eleMas', 'heal_'],
}

export const isStatSlot = (slot: string): slot is StatSlot =>
  slot === 'sands' || slot === 'goblet' || slot === 'circlet'

/** Why a worn piece doesn't tick its slot. */
export type SlotMiss = 'set' | 'stat' | 'level'

export interface SlotProgress {
  slot: ArtifactSlot
  done: boolean
  /** What the capture says (a worn piece meets the goal). */
  auto: boolean
  /** Ticked by hand (true done, false not done); null: the capture decides. */
  hand: boolean | null
  /** The piece worn there; null when none. */
  piece: GoodArtifact | null
  /** Why `piece` doesn't count; null when it does or there is none. */
  miss: SlotMiss | null
}

export interface SetProgress {
  key: string
  done: boolean
  /** The capture says done: every slot is. */
  auto: boolean
  hand: boolean | null
  /** Pieces of the set the character wears. */
  worn: number
}

export interface ArtifactProgress {
  slots: SlotProgress[]
  sets: SetProgress[]
  /** Slots done. */
  done: number
  /** Every slot done. */
  complete: boolean
  /** Sets still to farm (not done), in the goal's order. */
  open: string[]
}

/** The goal says anything: a set, a main stat, or a tick. */
export function hasArtifactGoal(goal: ArtifactGoal | null | undefined): goal is ArtifactGoal {
  if (!goal) return false
  if (goal.sets.length > 0) return true
  if (STAT_SLOTS.some((s) => (goal[s]?.length ?? 0) > 0)) return true
  return Object.values(goal.slots ?? {}).some((v) => v !== undefined)
}

/**
 * What `character` wears, one piece per slot (the first a capture lists).
 * The Traveler's gear is on "Traveler" whatever the element in its key.
 */
export function wornBy(
  artifacts: readonly GoodArtifact[],
  character: string,
): Map<ArtifactSlot, GoodArtifact> {
  const traveler = character.startsWith('Traveler')
  const worn = new Map<ArtifactSlot, GoodArtifact>()
  for (const a of artifacts) {
    if (!a.location) continue
    if (a.location !== character && !(traveler && a.location === 'Traveler')) continue
    const slot = a.slotKey as ArtifactSlot
    if ((ARTIFACT_SLOTS as readonly string[]).includes(slot) && !worn.has(slot)) worn.set(slot, a)
  }
  return worn
}

const handOf = (value: boolean | undefined) => (value === undefined ? null : value)

/** Each slot's and set's tick, from the goal and what the character wears. */
export function artifactProgress(
  goal: ArtifactGoal,
  worn: ReadonlyMap<ArtifactSlot, GoodArtifact>,
): ArtifactProgress {
  const wanted = new Set(goal.sets.map((s) => s.key))
  const ofWanted = (slot: ArtifactSlot) => {
    const p = worn.get(slot)
    return !!p && wanted.has(p.setKey)
  }
  const slots = ARTIFACT_SLOTS.map((slot): SlotProgress => {
    const piece = worn.get(slot) ?? null
    let miss: SlotMiss | null = null
    if (piece) {
      const stats = isStatSlot(slot) ? (goal[slot] ?? []) : []
      const otherFour = ARTIFACT_SLOTS.filter((s) => s !== slot).every(ofWanted)
      if (wanted.size > 0 && !wanted.has(piece.setKey) && !otherFour) miss = 'set'
      else if (stats.length > 0 && !stats.includes(piece.mainStatKey)) miss = 'stat'
      else if (piece.level < maxLevel(piece.rarity)) miss = 'level'
    }
    const auto = !!piece && miss === null
    const hand = handOf(goal.slots?.[slot])
    return { slot, done: hand ?? auto, auto, hand, piece, miss }
  })
  const done = slots.filter((s) => s.done).length
  const complete = done === ARTIFACT_SLOTS.length
  const sets = goal.sets.map((s): SetProgress => {
    const hand = handOf(s.done)
    const worn_ = [...worn.values()].filter((p) => p.setKey === s.key).length
    return { key: s.key, done: hand ?? complete, auto: complete, hand, worn: worn_ }
  })
  return { slots, sets, done, complete, open: sets.filter((s) => !s.done).map((s) => s.key) }
}

/**
 * The hand tick after a click on a tick showing `done`: the opposite, or
 * nothing (undefined) when that is what the capture says anyway.
 */
export function flipTick(done: boolean, auto: boolean): boolean | undefined {
  const next = !done
  return next === auto ? undefined : next
}

/** An empty goal (nothing chosen yet). */
export const NO_ARTIFACT_GOAL: ArtifactGoal = { sets: [] }

/**
 * The goal with empty parts dropped, or undefined when nothing is left (so a
 * stored target doesn't carry an empty artifacts object).
 */
export function tidyArtifactGoal(goal: ArtifactGoal): ArtifactGoal | undefined {
  const out: ArtifactGoal = {
    sets: goal.sets.map((s) => (s.done === undefined ? { key: s.key } : s)),
  }
  for (const slot of STAT_SLOTS) {
    const stats = goal[slot]
    if (stats && stats.length > 0) out[slot] = [...stats]
  }
  const slots = Object.fromEntries(
    Object.entries(goal.slots ?? {}).filter(([, v]) => v !== undefined),
  ) as ArtifactGoal['slots']
  if (slots && Object.keys(slots).length > 0) out.slots = slots
  return hasArtifactGoal(out) ? out : undefined
}

/** A set added (at the end; once). */
export function withSet(goal: ArtifactGoal, key: string): ArtifactGoal {
  if (goal.sets.some((s) => s.key === key)) return goal
  return { ...goal, sets: [...goal.sets, { key }] }
}

export function withoutSet(goal: ArtifactGoal, key: string): ArtifactGoal {
  return { ...goal, sets: goal.sets.filter((s) => s.key !== key) }
}

/** A main stat chosen or not on a slot. */
export function toggleStat(goal: ArtifactGoal, slot: StatSlot, stat: string): ArtifactGoal {
  const list = goal[slot] ?? []
  const next = list.includes(stat) ? list.filter((s) => s !== stat) : [...list, stat]
  return { ...goal, [slot]: next }
}

export function withSlotTick(
  goal: ArtifactGoal,
  slot: ArtifactSlot,
  tick: boolean | undefined,
): ArtifactGoal {
  return { ...goal, slots: { ...goal.slots, [slot]: tick } }
}

export function withSetTick(
  goal: ArtifactGoal,
  key: string,
  tick: boolean | undefined,
): ArtifactGoal {
  return { ...goal, sets: goal.sets.map((s) => (s.key === key ? { key, done: tick } : s)) }
}
