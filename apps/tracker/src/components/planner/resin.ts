/**
 * The resin tracker, pure: Original Resin now from the newest reading, the
 * capture's (irminsul's `gi_player.resin` at login, or a snapshot's
 * `OriginalResin` count) or one set by hand, regenerating one per 8 minutes
 * up to 200 (more only from refills, which don't regenerate).
 *
 * A reading set by hand counts until a capture read after it: the planner's
 * rule for hand edits, a newer capture replaces them. irminsul reads resin at
 * login, so a capture later in the same session leaves a hand-set value
 * alone; the next login replaces it.
 */

import { RESIN_MAX, RESIN_MINUTES, type ResinNow } from '@gdt/game-data/planner-estimate'
import type { ManualResin } from '@gdt/shared'

export { RESIN_MAX }

/** One point every 8 minutes. */
export const RESIN_STEP_MS = RESIN_MINUTES * 60_000

/** Hand-set values stop here (refills can take resin past the natural cap). */
export const RESIN_LIMIT = 2_000

export interface ResinReading {
  value: number
  /** When it was read or set (ms since epoch). */
  at: number
  source: 'manual' | ResinNow['source']
}

/** The reading to count from: the hand-set one when it is newer than the capture's. */
export function resinReading(
  captured: Pick<ResinNow, 'known' | 'atSnapshot' | 'at' | 'source'> | null,
  manual: ManualResin | null | undefined,
): ResinReading | null {
  const capture = captured?.known
    ? { value: captured.atSnapshot, at: captured.at, source: captured.source }
    : null
  if (manual && (!capture || manual.at > capture.at)) {
    return { value: manual.value, at: manual.at, source: 'manual' }
  }
  return capture
}

/** Whether a hand-set value was replaced by a capture read after it. */
export function manualReplaced(
  captured: Pick<ResinNow, 'known' | 'at'> | null,
  manual: ManualResin | null | undefined,
): boolean {
  return !!manual && !!captured?.known && captured.at >= manual.at
}

/** Resin at `now`: the reading plus what regenerated since, up to 200 (a value above stays). */
export function resinAt(reading: Pick<ResinReading, 'value' | 'at'>, now: number): number {
  if (reading.value >= RESIN_MAX) return reading.value
  const regenerated = Math.max(0, Math.floor((now - reading.at) / RESIN_STEP_MS))
  return Math.min(RESIN_MAX, reading.value + regenerated)
}

/**
 * When resin reaches `amount` (ms since epoch): in the past when it has
 * already, null when regeneration never gets there (above 200).
 */
export function reachedAt(reading: Pick<ResinReading, 'value' | 'at'>, amount: number) {
  if (reading.value >= amount) return reading.at
  if (amount > RESIN_MAX) return null
  return reading.at + (amount - reading.value) * RESIN_STEP_MS
}

/** When resin is full (200), null when it already is. */
export function fullAt(reading: Pick<ResinReading, 'value' | 'at'>, now: number): number | null {
  const at = reachedAt(reading, RESIN_MAX)
  return at === null || at <= now ? null : at
}

/**
 * The next multiple of `step` above the resin now (40: one more boss run)
 * and when it is there; null when full.
 */
export function nextMark(
  reading: Pick<ResinReading, 'value' | 'at'>,
  now: number,
  step = 40,
): { amount: number; at: number } | null {
  const current = resinAt(reading, now)
  if (current >= RESIN_MAX) return null
  const amount = Math.min(RESIN_MAX, (Math.floor(current / step) + 1) * step)
  return { amount, at: reachedAt(reading, amount)! }
}

/**
 * Resin set to `value` at `now`, keeping the regeneration clock: a point
 * under way since the last one still lands when it would have (the game's
 * timer doesn't restart when resin is spent).
 */
export function setResin(
  reading: Pick<ResinReading, 'value' | 'at'> | null,
  value: number,
  now: number,
): ManualResin {
  const v = Math.max(0, Math.min(RESIN_LIMIT, Math.trunc(value)))
  if (!reading || resinAt(reading, now) >= RESIN_MAX || v >= RESIN_MAX || now < reading.at) {
    return { value: v, at: now }
  }
  const phase = (now - reading.at) % RESIN_STEP_MS
  return { value: v, at: now - phase }
}

/** A quick button (−40, +60): the resin now plus `delta`; null when that is below zero. */
export function stepResin(
  reading: Pick<ResinReading, 'value' | 'at'> | null,
  delta: number,
  now: number,
): ManualResin | null {
  const current = reading ? resinAt(reading, now) : 0
  const next = current + delta
  if (next < 0) return null
  return setResin(reading, next, now)
}

/**
 * When a resin alert at `amount` should fire: the moment resin reaches it,
 * null when it already has (nothing to wait for) or never will.
 */
export function alertAt(
  reading: Pick<ResinReading, 'value' | 'at'> | null,
  amount: number,
  now: number,
): number | null {
  if (!reading || amount <= 0) return null
  const at = reachedAt(reading, amount)
  return at === null || at <= now ? null : at
}

/** Quick buttons from a settings string ("-40, +60"): whole numbers, none zero, at most four. */
export function parseSteps(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length > 4) return null
  const steps: number[] = []
  for (const p of parts) {
    if (!/^[+-]?\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n === 0 || n < -200 || n > 200) return null
    steps.push(n)
  }
  return steps
}

export const formatStep = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)
