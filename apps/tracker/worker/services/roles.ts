/**
 * Staff roles (tables `roles` / `user_roles`, migration 0020), Discord's model:
 *
 * - A user's permissions are the union of their roles' nodes; `*` (the
 *   built-in Owner) is every node.
 * - `position` is the hierarchy. Staff act only on users whose highest role
 *   sits strictly below their own (so never on themselves or an equal), edit
 *   and assign only roles below their own, and grant or take away only nodes
 *   they hold.
 * - Owner is given only from the command line (scripts/admin-grant.mjs); the
 *   dashboard can't edit, assign, remove or delete it.
 *
 * Permissions are read from D1 on every staff request (one small join), so a
 * change takes effect at once.
 */

import { ALL_PERMISSIONS, PERMISSION_NODES, type PermissionNode, type RoleRef } from '@gdt/shared'
import { ApiError } from '../lib/http'

export interface RoleRow extends RoleRef {
  permissions: string[]
  builtIn: boolean
}

/** Where a user without a role stands: below every role. */
export const NO_ROLE = Number.MIN_SAFE_INTEGER

/** A user's roles and what they add up to. */
export interface Standing {
  userId: number
  /** Highest first. */
  roles: RoleRow[]
  nodes: ReadonlySet<string>
  /** Holds `*`. */
  all: boolean
  /** The highest role's position, NO_ROLE without one. */
  position: number
}

const KNOWN = new Set<string>(PERMISSION_NODES)

function parsePermissions(value: unknown): string[] {
  let list: unknown = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.filter(
    (node): node is string =>
      typeof node === 'string' && (node === ALL_PERMISSIONS || KNOWN.has(node)),
  )
}

/** A `roles` row as D1 answers it (snake_case columns). */
export function roleFromRow(row: Record<string, unknown>): RoleRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color),
    position: Number(row.position),
    permissions: parsePermissions(row.permissions),
    builtIn: row.built_in === 1 || row.built_in === true,
  }
}

export const roleRef = (role: RoleRef): RoleRef => ({
  id: role.id,
  name: role.name,
  color: role.color,
  position: role.position,
})

export function standingOf(userId: number, roles: RoleRow[]): Standing {
  const sorted = [...roles].sort((a, b) => b.position - a.position || a.id - b.id)
  const nodes = new Set<string>()
  for (const role of sorted) for (const node of role.permissions) nodes.add(node)
  return {
    userId,
    roles: sorted,
    nodes,
    all: nodes.has(ALL_PERMISSIONS),
    position: sorted[0]?.position ?? NO_ROLE,
  }
}

/** The user's roles, highest first. */
export function userRolesStatement(d1: D1Database, userId: number): D1PreparedStatement {
  return d1
    .prepare(
      `SELECT r.id, r.name, r.color, r.position, r.permissions, r.built_in
       FROM user_roles AS ur JOIN roles AS r ON r.id = ur.role_id
       WHERE ur.user_id = ?1 ORDER BY r.position DESC, r.id`,
    )
    .bind(userId)
}

export async function loadStanding(d1: D1Database, userId: number): Promise<Standing> {
  const { results } = await userRolesStatement(d1, userId).all<Record<string, unknown>>()
  return standingOf(userId, results.map(roleFromRow))
}

/** Every role, highest first. */
export async function listRoles(d1: D1Database): Promise<RoleRow[]> {
  const { results } = await d1
    .prepare(
      'SELECT id, name, color, position, permissions, built_in FROM roles ORDER BY position DESC, id',
    )
    .all<Record<string, unknown>>()
  return results.map(roleFromRow)
}

/** The user's permission nodes (for MeResponse): the union of their roles', `*` kept as is. */
export function permissionsOf(standing: Standing): string[] {
  if (standing.all) return [ALL_PERMISSIONS]
  return PERMISSION_NODES.filter((node) => standing.nodes.has(node))
}

export async function userPermissions(d1: D1Database, userId: number): Promise<string[]> {
  return permissionsOf(await loadStanding(d1, userId))
}

export function can(standing: Standing, node: PermissionNode): boolean {
  return standing.all || standing.nodes.has(node)
}

/** Whether `actor` may act on a user standing at `target` (never themselves). */
export function outranks(actor: Standing, target: { userId: number; position: number }): boolean {
  return actor.userId !== target.userId && actor.position > target.position
}

/** Whether `actor` may give, take away or edit `role`: below their highest role, not Owner. */
export function canManageRole(actor: Standing, role: RoleRow): boolean {
  return !role.builtIn && role.position < actor.position
}

/** Whether `actor` holds every node in `nodes` (only those can be granted or taken away). */
export function holdsAll(actor: Standing, nodes: Iterable<string>): boolean {
  if (actor.all) return true
  for (const node of nodes) if (!actor.nodes.has(node)) return false
  return true
}

/** Throws 403 `hierarchy` unless the actor outranks the target user. */
export function assertOutranks(
  actor: Standing,
  target: { userId: number; position: number },
): void {
  if (!outranks(actor, target)) {
    throw new ApiError(
      403,
      'hierarchy',
      actor.userId === target.userId
        ? "Staff actions can't be used on yourself"
        : 'This user has a role as high as yours or higher',
    )
  }
}

/** The nodes a role list grants, sorted, for audit details. */
export function nodeDiff(before: readonly string[], after: readonly string[]) {
  const was = new Set(before)
  const now = new Set(after)
  return {
    added: after.filter((node) => !was.has(node)),
    removed: before.filter((node) => !now.has(node)),
  }
}
