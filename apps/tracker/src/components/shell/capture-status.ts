/**
 * The top bar's Capture button (design A, 2026-10-28): whether Teyvat.me
 * Capture (or irminsul) is sending this account's data.
 *
 * - live: a capture upload or live-sync change within LIVE_MS
 * - recent: one within RECENT_MS
 * - idle: an older one, or a capture app signed in that has sent nothing here
 * - none: no capture upload, no signed-in capture app, no user import key
 */

export type CaptureState = 'live' | 'recent' | 'idle' | 'none'

/** A change this recent means the app is running and sending now. */
export const LIVE_MS = 10 * 60_000
/** Green until a day without uploads. */
export const RECENT_MS = 24 * 3600_000

/** What the capture apps write as the GOOD file's `source`. */
export const CAPTURE_SOURCE = 'Irminsul'

export interface CaptureInput {
  /** The account's latest snapshot (its last upload and the file's source). */
  latest: { lastSeenAt: number; source?: string } | null
  /** The account's last live-sync change seen on the socket (ms). */
  liveAt?: number
  /** The user's newest signed-in capture app (bootstrap). */
  device: { device: string | null; lastSeenAt: number } | null
  /** The user has an import key for every account. */
  userKey: boolean
  now: number
}

export interface CaptureStatus {
  state: CaptureState
  /** The newest capture upload or change (ms), if any. */
  at: number | null
  /** The signed-in capture app's name, if any. */
  device: string | null
}

export function captureStatus(input: CaptureInput): CaptureStatus {
  const uploaded = input.latest?.source === CAPTURE_SOURCE ? input.latest.lastSeenAt : null
  const at = Math.max(uploaded ?? 0, input.liveAt ?? 0) || null
  const device = input.device?.device ?? null
  if (at === null) {
    return { state: input.device || input.userKey ? 'idle' : 'none', at, device }
  }
  const age = input.now - at
  const state = age < LIVE_MS ? 'live' : age < RECENT_MS ? 'recent' : 'idle'
  return { state, at, device }
}
