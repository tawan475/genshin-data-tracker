/**
 * What the staff pages read and write from the upload limits (migration
 * 0018: `site_settings`, `users.storage_quota`, `user_upload_days`) and from
 * device sessions (migration 0019: `user_sessions`, `users.signup_ip /
 * signup_country / last_active_at`), in one place.
 */

import {
  SIGNUP_MODES,
  type SessionMethod,
  type SignupMode,
  type StaffSessionRow,
  type StaffUsage,
} from '@gdt/shared'
import { endSession } from '../lib/session'
import {
  UPLOAD_LIMIT_DEFAULTS,
  UPLOAD_SETTING_KEYS,
  utcDay,
  type UploadLimits,
} from './upload-limits'

export type Limits = UploadLimits
export const LIMIT_DEFAULTS = UPLOAD_LIMIT_DEFAULTS

/** The `site_settings` key of the sign-up switch: `open`, `oauth` or `closed` (missing: open). */
export const SIGNUP_MODE_KEY = 'signup.mode'

// ------------------------------------------------------------------- sessions

/** SQL for a user's last activity (`alias` is the users table): the last sign-in or refresh. */
export const lastActiveSql = (alias: string) => `${alias}.last_active_at`
export const signupIpSql = (alias: string) => `${alias}.signup_ip`
export const signupCountrySql = (alias: string) => `${alias}.signup_country`

/**
 * A search for an IP among sign-up and session addresses (`arg` holds the
 * exact address). Session rows are kept 7 days after they end.
 */
export const ipSearchSql = (alias: string, arg: string): string =>
  `(${alias}.signup_ip = ${arg} OR EXISTS (SELECT 1 FROM user_sessions AS ss
    WHERE ss.user_id = ${alias}.id AND (ss.ip = ${arg} OR ss.created_ip = ${arg})))`

/** The user's signed-in devices (live sessions), the most recently seen first. */
export async function listUserSessions(
  d1: D1Database,
  userId: number,
  now = Date.now(),
): Promise<StaffSessionRow[]> {
  const { results } = await d1
    .prepare(
      `SELECT id, method, user_agent, ip, country, city, created_at, last_seen_at
       FROM user_sessions WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2
       ORDER BY last_seen_at DESC, id DESC`,
    )
    .bind(userId, now)
    .all<Record<string, unknown>>()
  return results.map((row) => ({
    id: Number(row.id),
    method: row.method as SessionMethod,
    userAgent: (row.user_agent as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
  }))
}

/** Signs one device of the user out (its row and its socket). False: no such live session. */
export function revokeUserSession(env: Env, userId: number, sessionId: number): Promise<boolean> {
  return endSession(env, userId, sessionId)
}

/** Ends every session row of these users (in a suspension's batch; the version bump does the rest). */
export function revokeSessionRowsStatement(
  d1: D1Database,
  userIds: readonly number[],
  now: number,
): D1PreparedStatement {
  return d1
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?2
       WHERE user_id IN (SELECT value FROM json_each(?1)) AND revoked_at IS NULL`,
    )
    .bind(JSON.stringify(userIds), now)
}

// ---------------------------------------------------------------- upload limits

/** SQL for the storage quota that applies to a user (`defaultQuota`: the site's). */
export const quotaSql = (alias: string, defaultQuota: number) =>
  `coalesce(${alias}.storage_quota, ${Math.floor(defaultQuota)})`

/** A limit as stored: a non-negative integer, else null (the default applies). */
function limitValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

export interface SiteSettings {
  limits: Limits
  /** Which limits a site_settings row overrides. */
  overridden: Record<keyof Limits, boolean>
  signupMode: SignupMode
}

const SETTING_KEYS = [...Object.values(UPLOAD_SETTING_KEYS), SIGNUP_MODE_KEY]

export function siteSettingsStatement(d1: D1Database): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT key, value FROM site_settings WHERE key IN (${SETTING_KEYS.map((_, i) => `?${i + 1}`).join(', ')})`,
    )
    .bind(...SETTING_KEYS)
}

export function readSiteSettingRows(rows: readonly Record<string, unknown>[]): SiteSettings {
  const values = new Map(rows.map((row) => [String(row.key), row.value]))
  const limits = { ...UPLOAD_LIMIT_DEFAULTS }
  const overridden = { dailySnapshots: false, dailyBytes: false, storageQuota: false }
  for (const name of Object.keys(limits) as (keyof Limits)[]) {
    const value = limitValue(values.get(UPLOAD_SETTING_KEYS[name]))
    if (value === null) continue
    limits[name] = value
    overridden[name] = true
  }
  const mode = String(values.get(SIGNUP_MODE_KEY) ?? '')
  return {
    limits,
    overridden,
    signupMode: (SIGNUP_MODES as readonly string[]).includes(mode) ? (mode as SignupMode) : 'open',
  }
}

export async function readSiteSettings(d1: D1Database): Promise<SiteSettings> {
  const { results } = await siteSettingsStatement(d1).all<Record<string, unknown>>()
  return readSiteSettingRows(results)
}

/** Who may sign up now (the staff switch, `signup.mode` in site_settings). */
export async function signupMode(d1: D1Database): Promise<SignupMode> {
  const row = await d1
    .prepare('SELECT value FROM site_settings WHERE key = ?1')
    .bind(SIGNUP_MODE_KEY)
    .first<{ value: string }>()
  const mode = row?.value ?? ''
  return (SIGNUP_MODES as readonly string[]).includes(mode) ? (mode as SignupMode) : 'open'
}

/** Writes site settings (a null value deletes the row: back to the default). */
export function siteSettingStatements(
  d1: D1Database,
  userId: number,
  values: Record<string, string | null>,
  now = Date.now(),
): D1PreparedStatement[] {
  return Object.entries(values).map(([key, value]) =>
    value === null
      ? d1.prepare('DELETE FROM site_settings WHERE key = ?1').bind(key)
      : d1
          .prepare(
            `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value,
               updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          )
          .bind(key, value, now, userId),
  )
}

/** One user's storage quota (null: the site's default). */
export function setQuotaStatement(
  d1: D1Database,
  userId: number,
  bytes: number | null,
): D1PreparedStatement {
  return d1.prepare('UPDATE users SET storage_quota = ?2 WHERE id = ?1').bind(userId, bytes)
}

/** Today's counts and the limits that apply to the user. */
export async function userUsage(
  d1: D1Database,
  userId: number,
  storedBytes: number,
  now = Date.now(),
): Promise<StaffUsage | null> {
  const [user, settings] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare(
        `SELECT u.storage_quota, coalesce(d.snapshots, 0) AS day_snapshots,
           coalesce(d.stored_bytes, 0) AS day_bytes
         FROM users AS u LEFT JOIN user_upload_days AS d ON d.user_id = u.id AND d.day = ?2
         WHERE u.id = ?1`,
      )
      .bind(userId, utcDay(now)),
    siteSettingsStatement(d1),
  ])
  const row = user!.results[0]
  if (!row) return null
  const { limits } = readSiteSettingRows(settings!.results)
  const own = limitValue(row.storage_quota)
  return {
    storedBytes,
    storageQuota: own ?? limits.storageQuota,
    quota: own,
    siteQuota: limits.storageQuota,
    daySnapshots: Number(row.day_snapshots),
    dayBytes: Number(row.day_bytes),
    dailySnapshots: limits.dailySnapshots,
    dailyBytes: limits.dailyBytes,
  }
}

/**
 * A CTE `caps (user_id, days)`: per user, the days of the last 7 (UTC) on
 * which they reached a daily cap.
 */
export function dailyCapCte(arg: (value: unknown) => string, limits: Limits, now: number): string {
  return `caps AS (SELECT user_id, count(*) AS days FROM user_upload_days
    WHERE day >= ${arg(utcDay(now - 6 * 86_400_000))}
      AND (snapshots >= ${arg(limits.dailySnapshots)} OR stored_bytes >= ${arg(limits.dailyBytes)})
    GROUP BY user_id)`
}
