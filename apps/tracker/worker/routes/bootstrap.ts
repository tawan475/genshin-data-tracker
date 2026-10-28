import {
  ACCOUNT_SETTINGS_DEFAULTS,
  deepMerge,
  type AccountSettingsPatch,
  type BootstrapResponse,
} from '@gdt/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { bodyEtag } from '../lib/etag'
import { ApiError } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { requireUser } from '../lib/session'
import { accountListStatement, accountsFromRows, type AccountListRow } from '../services/accounts'
import { meFromResults, meStatements } from '../services/me'
import { invitationsFromRows, invitationsStatement } from '../services/sharing'
import { withLegacySchema } from '../services/storage'
import { toMe } from './auth'

/** The newest signed-in capture app's row, as the bootstrap answers it. */
export function captureFromRow(
  row: { device_name: string | null; last_seen_at: number } | undefined,
): BootstrapResponse['capture'] {
  return row ? { device: row.device_name, lastSeenAt: row.last_seen_at } : null
}

/**
 * GET /api/bootstrap?account=<id>: the user, their accounts and the opened
 * account's settings in one request and one D1 round trip, so the app's
 * first page waits for one trip instead of `me`, then `accounts`, then the
 * account's settings. The separate routes stay (and answer the same).
 */
export const bootstrap = new Hono<AppEnv>().get('/', requireUser, async (c) => {
  const userId = c.get('userId')
  const wanted = Number(c.req.query('account'))
  const accountId = Number.isSafeInteger(wanted) && wanted > 0 ? wanted : null
  const d1 = c.env.DB
  const meter = new D1Meter()
  const results = await withLegacySchema((legacy) =>
    meter.batch(d1, 'bootstrap', [
      ...meStatements(d1, userId),
      accountListStatement(d1, userId, null, legacy),
      d1
        .prepare(
          `SELECT a.id, a.settings FROM genshin_accounts AS a WHERE a.id = ?1
             AND (a.user_id = ?2 OR EXISTS (SELECT 1 FROM account_members AS m
               WHERE m.account_id = a.id AND m.user_id = ?2 AND m.accepted_at IS NOT NULL))`,
        )
        .bind(accountId ?? 0, userId),
      invitationsStatement(d1, userId, Date.now()),
      // The top bar's Capture button: the newest signed-in capture app.
      d1
        .prepare(
          `SELECT device_name, last_seen_at FROM user_sessions
             WHERE user_id = ?1 AND method = 'irminsul' AND revoked_at IS NULL AND expires_at > ?2
             ORDER BY last_seen_at DESC LIMIT 1`,
        )
        .bind(userId, Date.now()),
    ]),
  )
  meter.report(c)
  const [user, roles, list, settings, invited, device] = results
  const found = meFromResults(userId, user, roles)
  if (!found) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  const accounts = accountsFromRows((list?.results ?? []) as unknown as AccountListRow[])
  const settingsRow = settings?.results[0] as { id: number; settings: string } | undefined
  const body: BootstrapResponse = {
    me: toMe(found.user, c.env, found.permissions),
    accounts,
    // The same tag GET /api/accounts gives this list (over the same JSON).
    accountsEtag: await bodyEtag('l', JSON.stringify(accounts)),
    account: settingsRow
      ? {
          id: settingsRow.id,
          settings: deepMerge(
            ACCOUNT_SETTINGS_DEFAULTS,
            JSON.parse(settingsRow.settings) as AccountSettingsPatch,
          ),
        }
      : null,
    invitations: invitationsFromRows(invited?.results ?? []),
    capture: captureFromRow(
      device?.results[0] as { device_name: string | null; last_seen_at: number } | undefined,
    ),
  }
  c.header('Cache-Control', 'private, no-store')
  return c.json(body)
})
