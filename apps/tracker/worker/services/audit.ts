/**
 * The staff audit log (table `admin_audit`, migration 0020): every write from
 * the staff dashboard, and every look at a user's game data. Rows keep the
 * names as labels and have no foreign keys, so they outlive the users they
 * name. Written in the same D1 batch as the action where there is one, so an
 * action never happens without its row.
 *
 * Actions: `user.suspend`, `user.unsuspend`, `user.rename`, `user.reset_link`,
 * `user.sessions`, `user.unlink`, `user.delete`, `user.delete_self`,
 * `role.assign`, `role.unassign`, `role.create`, `role.update`,
 * `role.delete`, `role.reorder`, `data.inspect`, `data.block_uploads`,
 * `data.unblock_uploads`, `data.quota`, `data.reset_key`, `data.delete`,
 * `data.delete_account`, `site.signups`, `site.limits`.
 */

import type { AuditKind, AuditRow } from '@gdt/shared'

export interface AuditActor {
  userId: number
  username: string
}

export interface AuditEntry {
  action: string
  target?: { id: number; label: string } | null
  detail?: Record<string, unknown>
}

/** Keeps a detail small: strings cut to 300 characters, at most 2 KB of JSON. */
function detailJson(detail: Record<string, unknown> = {}): string {
  const json = JSON.stringify(detail, (_, value) =>
    typeof value === 'string' && value.length > 300 ? `${value.slice(0, 300)}…` : value,
  )
  return json.length > 2048 ? JSON.stringify({ truncated: true }) : json
}

export function auditStatement(
  d1: D1Database,
  actor: AuditActor,
  entry: AuditEntry,
  now = Date.now(),
): D1PreparedStatement {
  return d1
    .prepare(
      `INSERT INTO admin_audit (actor_user_id, actor_label, action, target_user_id, target_label, detail, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      actor.userId,
      actor.username,
      entry.action,
      entry.target?.id ?? null,
      entry.target?.label ?? null,
      detailJson(entry.detail),
      now,
    )
}

export async function audit(d1: D1Database, actor: AuditActor, entry: AuditEntry): Promise<void> {
  await auditStatement(d1, actor, entry).run()
}

/**
 * One `data.inspect` row per staff member, account and WINDOW: the data
 * routes log through this, so no read goes unlogged, while the page opens
 * (logged one each) keep the log readable.
 */
export const INSPECT_DEDUPE_MS = 10 * 60_000

export function inspectReadStatement(
  d1: D1Database,
  actor: AuditActor,
  target: { id: number; label: string },
  detail: { accountId: number; account: string; view: string },
  now = Date.now(),
): D1PreparedStatement {
  return d1
    .prepare(
      `INSERT INTO admin_audit (actor_user_id, actor_label, action, target_user_id, target_label, detail, created_at)
       SELECT ?1, ?2, 'data.inspect', ?3, ?4, ?5, ?6
       WHERE NOT EXISTS (SELECT 1 FROM admin_audit
         WHERE target_user_id = ?3 AND created_at > ?7 AND actor_user_id = ?1
           AND action = 'data.inspect' AND json_extract(detail, '$.accountId') = ?8)`,
    )
    .bind(
      actor.userId,
      actor.username,
      target.id,
      target.label,
      detailJson(detail),
      now,
      now - INSPECT_DEDUPE_MS,
      detail.accountId,
    )
}

/** Which actions each filter of the audit page shows. */
const KIND_SQL: Record<AuditKind, string> = {
  views: "a.action = 'data.inspect'",
  deletes: "a.action IN ('user.delete', 'user.delete_self', 'data.delete', 'data.delete_account')",
  users: "a.action LIKE 'user.%'",
  data: "a.action LIKE 'data.%' AND a.action <> 'data.inspect'",
  roles: "a.action LIKE 'role.%'",
  site: "a.action LIKE 'site.%'",
}

export interface AuditQuery {
  q?: string
  actor?: number
  kind?: AuditKind
  target?: number
  limit: number
  offset: number
  /** Also list everyone with an entry (the audit page's staff filter). */
  actors?: boolean
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function rowOf(row: Record<string, unknown>): AuditRow {
  let detail: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(String(row.detail))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      detail = parsed as Record<string, unknown>
    }
  } catch {
    // A row from a bad write: show it without detail.
  }
  return {
    id: Number(row.id),
    at: Number(row.created_at),
    actor: {
      id: Number(row.actor_user_id),
      // The current name while the staff member exists, else the one kept.
      label: String(row.actor_name ?? row.actor_label),
      color: (row.actor_color as string | null) ?? null,
    },
    action: String(row.action),
    target: {
      id: row.target_user_id === null ? null : Number(row.target_user_id),
      label: (row.target_label as string | null) ?? null,
    },
    detail,
  }
}

/** Newest first, with the total for the pager and everyone who has an entry. */
export async function listAudit(
  d1: D1Database,
  query: AuditQuery,
): Promise<{ rows: AuditRow[]; total: number; actors: { id: number; label: string }[] }> {
  const where: string[] = []
  const args: unknown[] = []
  const arg = (value: unknown) => {
    args.push(value)
    return `?${args.length}`
  }
  if (query.actor !== undefined) where.push(`a.actor_user_id = ${arg(query.actor)}`)
  if (query.target !== undefined) where.push(`a.target_user_id = ${arg(query.target)}`)
  if (query.kind) where.push(`(${KIND_SQL[query.kind]})`)
  const q = query.q?.trim().toLowerCase()
  if (q) {
    const like = arg(`%${escapeLike(q)}%`)
    where.push(
      `(lower(a.target_label) LIKE ${like} ESCAPE '\\' OR lower(a.actor_label) LIKE ${like} ESCAPE '\\'
        OR lower(a.detail) LIKE ${like} ESCAPE '\\' OR a.action LIKE ${like} ESCAPE '\\')`,
    )
  }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = arg(query.limit)
  const offset = arg(query.offset)
  const [rows, total, actors] = await d1.batch<Record<string, unknown>>([
    d1
      .prepare(
        `SELECT a.*, u.username AS actor_name,
           (SELECT r.color FROM user_roles AS ur JOIN roles AS r ON r.id = ur.role_id
            WHERE ur.user_id = a.actor_user_id ORDER BY r.position DESC LIMIT 1) AS actor_color
         FROM admin_audit AS a LEFT JOIN users AS u ON u.id = a.actor_user_id
         ${filter} ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`,
      )
      .bind(...args),
    d1
      .prepare(`SELECT count(*) AS n FROM admin_audit AS a ${filter}`)
      .bind(...args.slice(0, args.length - 2)),
    ...(query.actors
      ? [
          d1.prepare(
            `SELECT a.actor_user_id AS id, coalesce(u.username, max(a.actor_label)) AS label
             FROM admin_audit AS a LEFT JOIN users AS u ON u.id = a.actor_user_id
             GROUP BY a.actor_user_id ORDER BY label`,
          ),
        ]
      : []),
  ])
  return {
    rows: rows!.results.map(rowOf),
    total: Number(total!.results[0]?.n ?? 0),
    actors: (actors?.results ?? []).map((row) => ({
      id: Number(row.id),
      label: String(row.label),
    })),
  }
}

/** The newest entries about one user (their detail page). */
export async function userHistory(d1: D1Database, userId: number, limit = 10): Promise<AuditRow[]> {
  return (await listAudit(d1, { target: userId, limit, offset: 0 })).rows
}
