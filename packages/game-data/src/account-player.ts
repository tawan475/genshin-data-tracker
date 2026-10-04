/**
 * What irminsul's `gi_player` says about an account across its snapshots,
 * for the planner: Adventure Rank, World Level and Original Resin.
 *
 * The game sends these values at login and irminsul does not follow them
 * while the game runs, so every snapshot of one session carries the same
 * section (stored once, same hash). Resin therefore counts from the first
 * snapshot of that run, the one closest to the login, not from the newest.
 */

import type { LoginResin } from './planner-estimate'

/** The `gi_player` fields read here (the stored section has more). */
export interface PlayerValues {
  ar?: number
  wl?: number
  resin?: number
}

/** One snapshot's player section, as a bundle lists it. */
export interface PlayerSection {
  takenAt: number
  /** The section's hash; null or absent when the snapshot has none. */
  key?: string | null
}

export interface AccountPlayer {
  /** From the newest snapshot that has each; null when none does. */
  ar: number | null
  wl: number | null
  /**
   * Original Resin, only when the newest snapshot has it (an older count
   * would be stale), with the time of the first snapshot of its session.
   */
  resin: LoginResin | null
}

export const NO_PLAYER: AccountPlayer = { ar: null, wl: null, resin: null }

/** Each distinct section is decoded once. */
export function accountPlayer(
  sections: readonly PlayerSection[],
  decode: (key: string) => PlayerValues,
): AccountPlayer {
  const newestFirst = [...sections].sort((a, b) => b.takenAt - a.takenAt)
  const decoded = new Map<string, PlayerValues>()
  const values = (key: string) => {
    let value = decoded.get(key)
    if (!value) decoded.set(key, (value = decode(key)))
    return value
  }

  let ar: number | null = null
  let wl: number | null = null
  for (const { key } of newestFirst) {
    if (!key) continue
    const player = values(key)
    ar ??= player.ar ?? null
    wl ??= player.wl ?? null
    if (ar !== null && wl !== null) break
  }

  let resin: LoginResin | null = null
  const newest = newestFirst[0]
  const value = newest?.key ? values(newest.key).resin : undefined
  if (newest?.key && value !== undefined) {
    let at = newest.takenAt
    for (const s of newestFirst) {
      if (s.key !== newest.key) break
      at = s.takenAt
    }
    resin = { value, at }
  }

  return { ar, wl, resin }
}
