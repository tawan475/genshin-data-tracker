/**
 * `gi_capture`: why irminsul took a snapshot and which play session it
 * belongs to (docs/plans/live-sync.md §5.1). Optional, irminsul's own
 * top-level key; a wire contract (append fields only). It never changes a
 * snapshot's content hash.
 */

/**
 * Why the snapshot was taken (append only): the game's full sends (`login`,
 * `world`), the user's button (`manual`), the tracker asking (`collapse`),
 * the game closing (`logout`), the tracker refusing a batch (`resync`), or a
 * change uploaded whole because live sync is off (`change`).
 */
export const CAPTURE_REASONS = [
  'login',
  'world',
  'manual',
  'collapse',
  'logout',
  'resync',
  'change',
] as const
export type CaptureReason = (typeof CAPTURE_REASONS)[number]

export interface GiCapture {
  v: 1
  reason: CaptureReason
  /** irminsul's id of the game login this snapshot belongs to. */
  session: string
  /** 1 = the player's own world, 2+ = co-op worlds by order within the session. */
  world: number
  /** The journal sequence this snapshot ends (0 at login). */
  journal: { seq: number }
}

const SESSION = /^[A-Za-z0-9_-]{8,64}$/

/** The parts of an uploaded `gi_capture` that pass their checks; null when unusable. */
export function readCapture(raw: unknown): GiCapture | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.v !== 1) return null
  const reason = value.reason
  if (typeof reason !== 'string' || !(CAPTURE_REASONS as readonly string[]).includes(reason)) {
    return null
  }
  if (typeof value.session !== 'string' || !SESSION.test(value.session)) return null
  const world =
    typeof value.world === 'number' && Number.isInteger(value.world) && value.world >= 1
      ? Math.min(value.world, 1000)
      : 1
  const journal = value.journal as Record<string, unknown> | undefined
  const seq =
    journal &&
    typeof journal.seq === 'number' &&
    Number.isSafeInteger(journal.seq) &&
    journal.seq >= 0
      ? journal.seq
      : 0
  return { v: 1, reason: reason as CaptureReason, session: value.session, world, journal: { seq } }
}
