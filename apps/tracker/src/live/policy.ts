/**
 * The decisions behind live updates, kept pure so they can be tested without
 * a socket, a timer or a page: how long to wait before reconnecting, which
 * events need the account list re-read, how fresh rows fold into the shown
 * list (or wait while a dialog is open), and which of them is a new capture.
 */

import type { AccountResponse, LiveEvent } from '@gdt/shared'

// ----------------------------------------------------------------- timing

/** First reconnect wait; it doubles per failed attempt up to the cap. */
export const RECONNECT_BASE_MS = 1_000
export const RECONNECT_MAX_MS = 30_000
/** Failed connects in a row (none opened) before slow polling backs the socket up. */
export const FALLBACK_AFTER = 3
/** Slow poll of the account list while the socket cannot connect (visible tabs only). */
export const FALLBACK_POLL_MS = 60_000
/** Keep-alive: a `ping` this often; no `pong` within the timeout means a dead socket. */
export const PING_MS = 45_000
export const PONG_TIMEOUT_MS = 10_000
/** Re-reads of the list after events: at most one per gap (the first one at once). */
export const FETCH_GAP_MS = 2_000
/** A burst (a bulk import elsewhere): this many events within the window widens the gap. */
export const BURST_EVENTS = 5
export const BURST_WINDOW_MS = 30_000
export const BURST_GAP_MS = 10_000
/** Hidden at least this long, a tab re-reads the list when it is shown again. */
export const CATCH_UP_AFTER_HIDDEN_MS = 30_000

/**
 * Wait before reconnect attempt `attempt` (1-based): 1 s, 2 s, 4 s … 30 s,
 * each shortened by up to a quarter at random so tabs do not reconnect in step.
 */
export function reconnectDelay(attempt: number, random = Math.random()): number {
  const raw = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1))
  return Math.round(raw * (0.75 + 0.25 * Math.min(1, Math.max(0, random))))
}

/** How long until the list may be re-read, given the last read and the recent events. */
export function fetchDelay(
  now: number,
  lastFetchAt: number,
  eventTimes: readonly number[],
): number {
  const recent = eventTimes.filter((t) => now - t < BURST_WINDOW_MS).length
  const gap = recent >= BURST_EVENTS ? BURST_GAP_MS : FETCH_GAP_MS
  return Math.max(0, lastFetchAt + gap - now)
}

/** Whether a tab shown again should re-read the list (pushes may have been missed). */
export function shouldCatchUp(state: {
  hiddenMs: number
  /** An event arrived while hidden. */
  stale: boolean
  socketOpen: boolean
}): boolean {
  return state.stale || !state.socketOpen || state.hiddenMs >= CATCH_UP_AFTER_HIDDEN_MS
}

// ----------------------------------------------------------------- events

/** A socket message as an event, or null for anything else (keep-alives, junk). */
export function parseLiveEvent(text: unknown): LiveEvent | null {
  if (typeof text !== 'string' || !text.startsWith('{')) return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (event.type === 'accounts') return { type: 'accounts' }
  if (event.type !== 'data' || !Number.isSafeInteger(event.accountId)) return null
  return {
    type: 'data',
    accountId: event.accountId as number,
    dataVersion: Number.isSafeInteger(event.dataVersion) ? (event.dataVersion as number) : null,
    ...(typeof event.takenAt === 'number' ? { takenAt: event.takenAt } : {}),
  }
}

/**
 * Whether `event` tells this tab something it does not know yet. A data event
 * for a version already held (this tab's own import, or a list another tab
 * shared) needs nothing; anything else re-reads the list.
 */
export function eventNeedsFetch(event: LiveEvent, knownVersion: (id: number) => number | null) {
  if (event.type !== 'data' || event.dataVersion === null) return true
  const known = knownVersion(event.accountId)
  return known === null || known < event.dataVersion
}

// ----------------------------------------------------------------- merging

export interface MergeInput {
  /** What the app shows now. */
  shown: readonly AccountResponse[]
  /** Newer rows held back until the user is done (see `held`). */
  pending: ReadonlyMap<number, AccountResponse>
  fresh: readonly AccountResponse[]
  /** `fresh` is the whole list, so accounts missing from it are gone. */
  complete: boolean
  /** Whether a newer version of this account must wait (a dialog is open, an import runs). */
  held: (id: number) => boolean
}

export interface MergeOutput {
  shown: AccountResponse[]
  pending: Map<number, AccountResponse>
  /** Rows now shown whose newest snapshot is new: what the "New capture" toast is about. */
  captures: AccountResponse[]
  changed: boolean
}

/** Same row as far as anything on screen goes (the summary moves only with the version). */
export function sameAccount(a: AccountResponse, b: AccountResponse): boolean {
  return (
    a.id === b.id &&
    a.dataVersion === b.dataVersion &&
    a.name === b.name &&
    a.uid === b.uid &&
    a.server === b.server &&
    a.createdAt === b.createdAt &&
    a.snapshotCount === b.snapshotCount &&
    a.rawBytes === b.rawBytes &&
    a.storedBytes === b.storedBytes &&
    a.latest?.id === b.latest?.id &&
    a.latest?.takenAt === b.latest?.takenAt &&
    a.latest?.lastSeenAt === b.latest?.lastSeenAt
  )
}

/** Whether `after` brought a newer newest capture than `before` had (not a delete or a backfill). */
export function isNewCapture(before: AccountResponse | undefined, after: AccountResponse): boolean {
  const next = after.latest
  if (!next) return false
  const previous = before?.latest
  if (!previous) return true
  return next.id !== previous.id && next.takenAt >= previous.takenAt
}

/**
 * Folds `fresh` rows (and any held-back ones) into the shown list:
 * - a newer version replaces the shown row, unless `held`, when it waits in
 *   `pending` (the newest one wins) and the row on screen stays as it is;
 * - the same version replaces it only when something visible differs (a
 *   rename), so untouched rows keep their identity and nothing reloads;
 * - an older version (a late or stale message) is ignored;
 * - new accounts are added at once, and with a `complete` list, accounts it
 *   lacks are dropped.
 */
export function mergeAccounts(input: MergeInput): MergeOutput {
  const { shown, fresh, complete, held } = input
  const pending = new Map(input.pending)
  const candidates = new Map(pending)
  for (const row of fresh) {
    const waiting = candidates.get(row.id)
    if (!waiting || waiting.dataVersion <= row.dataVersion) candidates.set(row.id, row)
  }
  if (complete) {
    const present = new Set(fresh.map((row) => row.id))
    for (const id of [...candidates.keys()]) if (!present.has(id)) candidates.delete(id)
    for (const id of [...pending.keys()]) if (!present.has(id)) pending.delete(id)
  }

  const captures: AccountResponse[] = []
  let changed = false
  const pick = (current: AccountResponse): AccountResponse | null => {
    const next = candidates.get(current.id)
    candidates.delete(current.id)
    if (!next) {
      if (complete) changed = true // gone
      return complete ? null : current
    }
    if (next.dataVersion < current.dataVersion) {
      pending.delete(current.id)
      return current
    }
    if (next.dataVersion === current.dataVersion) {
      pending.delete(current.id)
      if (sameAccount(current, next)) return current
      changed = true
      return next
    }
    if (held(current.id)) {
      pending.set(current.id, next)
      return current
    }
    pending.delete(current.id)
    if (isNewCapture(current, next)) captures.push(next)
    changed = true
    return next
  }

  let next = shown.map(pick).filter((row): row is AccountResponse => row !== null)
  // What is left is new to this tab.
  for (const row of candidates.values()) {
    pending.delete(row.id)
    if (isNewCapture(undefined, row)) captures.push(row)
    next.push(row)
    changed = true
  }
  if (complete && changed) {
    // The server's order (by id).
    const order = new Map(fresh.map((row, i) => [row.id, i]))
    next = next.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }
  return { shown: changed ? next : [...shown], pending, captures, changed }
}

/**
 * The capture the toast is about: the open account's, or on pages about no
 * account (the account list), the newest one.
 */
export function captureToShow(
  captures: readonly AccountResponse[],
  openAccountId: number | null,
): AccountResponse | null {
  if (openAccountId !== null) return captures.find((a) => a.id === openAccountId) ?? null
  let newest: AccountResponse | null = null
  for (const account of captures) {
    if (!newest || account.latest!.takenAt > newest.latest!.takenAt) newest = account
  }
  return newest
}
