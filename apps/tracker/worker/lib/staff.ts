/**
 * Staff routes' gate (worker/routes/staff.ts). `requireStaff` runs after
 * requireActiveSession (the session row is live: a device signed out, or
 * every device after a password change, gets no further) and reads, in one
 * D1 round trip, the user's roles and whether they are suspended. Without
 * `staff.view` every staff route is a 404, as if it did not exist; `need`
 * does the same per route for its node. Nodes are read on every request, so
 * taking a role away works at once.
 */

import type { PermissionNode } from '@gdt/shared'
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'
import { can, roleFromRow, standingOf, userRolesStatement, type Standing } from '../services/roles'
import { ApiError, notFound } from './http'

export interface StaffActor extends Standing {
  username: string
}

export const requireStaff: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = c.get('userId')
  const [user, roles] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare('SELECT username, token_version, suspended_at FROM users WHERE id = ?1').bind(
      userId,
    ),
    userRolesStatement(c.env.DB, userId),
  ])
  const row = user!.results[0]
  if (!row) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  const version = c.get('tokenVersion')
  if (version !== null && version < Number(row.token_version)) {
    throw new ApiError(401, 'session_revoked', 'Session ended, sign in again')
  }
  if (row.suspended_at !== null) {
    throw new ApiError(403, 'account_suspended', 'This account is suspended')
  }
  const standing = standingOf(userId, roles!.results.map(roleFromRow))
  if (!can(standing, 'staff.view')) throw notFound()
  c.set('staff', { ...standing, username: String(row.username) })
  c.header('Cache-Control', 'no-store')
  await next()
}

/** A staff route that needs `node` (404 without it). */
export function need(...nodes: PermissionNode[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const staff = c.get('staff')
    if (!nodes.every((node) => can(staff, node))) throw notFound()
    await next()
  }
}
