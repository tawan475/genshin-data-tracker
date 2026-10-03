import type { GoodSubstat } from './good'
import { sha256Hex128 } from './hash'

export const MAX_SUBSTATS: Readonly<Record<string, number>> = {
  hp: 298.75,
  hp_: 5.83,
  atk: 19.45,
  atk_: 5.83,
  def: 23.15,
  def_: 7.29,
  eleMas: 23.31,
  enerRech_: 6.48,
  critRate_: 3.89,
  critDMG_: 7.77,
}

export function calculateCV(substats: readonly { key: string; value: number }[]): number {
  let cv = 0
  for (const s of substats) {
    if (s.key === 'critRate_') cv += s.value * 2
    if (s.key === 'critDMG_') cv += s.value
  }
  return Number(cv.toFixed(2))
}

export function calculateRV(substats: readonly { key: string; value: number }[]): number {
  let rv = 0
  for (const s of substats) {
    const max = MAX_SUBSTATS[s.key]
    if (max && s.value) rv += (s.value / max) * 100
  }
  return Math.round(rv / 10) * 10
}

/**
 * Everything about an artifact that does not change while it sits in the
 * inventory. Levelling or rolling a substat produces a different identity, so
 * a catalog row keyed by this is immutable.
 *
 * `location`, `lock` and `astralMark` are deliberately absent: they change
 * without the artifact changing, so they are stored per snapshot
 * ({@link ArtifactState}) and history keeps the state each snapshot saw.
 */
export interface ArtifactIdentity {
  setKey: string
  slotKey: string
  level: number
  rarity: number
  mainStatKey: string
  substats: GoodSubstat[]
  totalRolls: number
  elixerCrafted: boolean
  unactivatedSubstats: GoodSubstat[]
}

export interface ArtifactState {
  location: string
  lock: boolean
  astralMark: boolean
}

/**
 * The canonical text an artifact's identity hashes over. Keys are written in a
 * fixed order and substats keep the game's order, so the same artifact always
 * yields the same text. Changing this changes every hash: it is part of the
 * storage format.
 */
export function artifactIdentityText(identity: ArtifactIdentity): string {
  return JSON.stringify([
    identity.setKey,
    identity.slotKey,
    identity.level,
    identity.rarity,
    identity.mainStatKey,
    identity.substats.map(substatTuple),
    identity.totalRolls,
    identity.elixerCrafted ? 1 : 0,
    identity.unactivatedSubstats.map(substatTuple),
  ])
}

function substatTuple(s: GoodSubstat): [string, number, number | null] {
  return [s.key, s.value, s.initialValue ?? null]
}

export function hashArtifactIdentity(identity: ArtifactIdentity): Promise<string> {
  return sha256Hex128(artifactIdentityText(identity))
}
