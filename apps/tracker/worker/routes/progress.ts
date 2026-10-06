/**
 * Per-account progress the player sets by hand: achievements marked done,
 * planner goals, and the planner's hand edits on top of the newest capture
 * (material counts, a goal's current state). None of it touches snapshots,
 * so `dataVersion` (and with it every cached bundle) stays put.
 *
 * Writes go through `json_each` so a bulk change (a Seelie import is a few
 * hundred rows) is one statement, and each request is a single D1 batch:
 * the writes followed by the read that answers it. Planner writes tell the
 * user's other tabs and devices (`planner` live event).
 */

import {
  achievementMarksPatch,
  plannerStatePatch,
  plannerTargetsPatch,
  type AchievementMarksResponse,
  type CurrentOverride,
  type InventoryAdjustment,
  type PlannerStateResponse,
  type PlannerTarget,
  type PlannerTargetsResponse,
} from '@gdt/shared'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { ApiError, idParam, parseJson } from '../lib/http'
import { requireUser } from '../lib/session'
import { assertOwnsAccount } from '../services/accounts'
import { listenerOf, listenerStatement, notifyUser } from '../services/live'

const SELECT_MARKS =
  'SELECT achievement_id AS id FROM achievement_marks WHERE account_id = ?1 ORDER BY achievement_id'

const SELECT_TARGETS = `SELECT kind, key, owner, target, updated_at AS updatedAt
  FROM planner_targets WHERE account_id = ?1 ORDER BY kind, key, owner`

interface TargetRow {
  kind: PlannerTarget['kind']
  key: string
  owner: string
  target: string
  updatedAt: number
}

function toTargets(rows: TargetRow[]): PlannerTarget[] {
  return rows.map((row) => ({ ...row, target: JSON.parse(row.target) }) as PlannerTarget)
}

/**
 * The newest capture's `last_seen_at` (0 without one), for account `?1`: the
 * capture hand edits are made against. Seen-again uploads move it too: the
 * game showed the same bag later, so edits made in between are replaced.
 */
const CAPTURED = `(SELECT COALESCE(MAX(s.last_seen_at), 0) FROM genshin_accounts AS a
  JOIN snapshots AS s ON s.id = a.latest_snapshot_id WHERE a.id = ?1)`

const SELECT_ADJUSTMENTS = `SELECT key, delta, set_value AS "set", base_seen_at AS base,
  updated_at AS updatedAt FROM inventory_adjustments WHERE account_id = ?1 ORDER BY key`

const SELECT_OVERRIDES = `SELECT kind, key, owner, current FROM planner_targets
  WHERE account_id = ?1 AND current IS NOT NULL ORDER BY kind, key, owner`

interface OverrideRow {
  kind: CurrentOverride['kind']
  key: string
  owner: string
  current: string
}

function plannerState(
  captured: D1Result | undefined,
  adjustments: D1Result | undefined,
  overrides: D1Result | undefined,
): PlannerStateResponse {
  const at = (captured?.results[0] as { captured?: number } | undefined)?.captured ?? 0
  return {
    capturedAt: at > 0 ? at : null,
    adjustments: (adjustments?.results ?? []) as unknown as InventoryAdjustment[],
    overrides: ((overrides?.results ?? []) as unknown as OverrideRow[]).map(
      (row) => ({ ...row, current: JSON.parse(row.current) }) as CurrentOverride,
    ),
  }
}

/** The tab that sent a write (`x-gdt-tab`), echoed in its live event so that tab skips it. */
function senderTab(c: Context<AppEnv>): { tab?: string } {
  const tab = c.req.header('x-gdt-tab')
  return tab && /^[A-Za-z0-9_-]{1,40}$/.test(tab) ? { tab } : {}
}

export const progress = new Hono<AppEnv>()
  .use(requireUser)

  .get('/:id/achievement-marks', async (c) => {
    const id = idParam(c, 'id')
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const { results } = await c.env.DB.prepare(SELECT_MARKS).bind(id).all<{ id: number }>()
    return c.json<AchievementMarksResponse>({ done: results.map((r) => r.id) })
  })

  /** `done` is applied before `undone`, so an id in both ends up unmarked. */
  .patch('/:id/achievement-marks', async (c) => {
    const id = idParam(c, 'id')
    const body = await parseJson(c, achievementMarksPatch)
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const d1 = c.env.DB
    const statements: D1PreparedStatement[] = []
    if (body.done.length > 0) {
      statements.push(
        // `WHERE true` resolves SQLite's INSERT … SELECT … ON CONFLICT parse ambiguity.
        d1
          .prepare(
            `INSERT INTO achievement_marks (account_id, achievement_id, updated_at)
             SELECT ?1, value, ?2 FROM json_each(?3) WHERE true
             ON CONFLICT (account_id, achievement_id) DO UPDATE SET updated_at = excluded.updated_at`,
          )
          .bind(id, Date.now(), JSON.stringify(body.done)),
      )
    }
    if (body.undone.length > 0) {
      statements.push(
        d1
          .prepare(
            `DELETE FROM achievement_marks
             WHERE account_id = ?1 AND achievement_id IN (SELECT value FROM json_each(?2))`,
          )
          .bind(id, JSON.stringify(body.undone)),
      )
    }
    const results = await d1.batch([...statements, d1.prepare(SELECT_MARKS).bind(id)])
    const rows = (results.at(-1)!.results ?? []) as { id: number }[]
    return c.json<AchievementMarksResponse>({ done: rows.map((r) => r.id) })
  })

  .get('/:id/planner-targets', async (c) => {
    const id = idParam(c, 'id')
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const { results } = await c.env.DB.prepare(SELECT_TARGETS).bind(id).all<TargetRow>()
    return c.json<PlannerTargetsResponse>({ targets: toTargets(results) })
  })

  /** `remove` is applied before `upsert`, so moving a weapon goal is one request. */
  .patch('/:id/planner-targets', async (c) => {
    const id = idParam(c, 'id')
    const body = await parseJson(c, plannerTargetsPatch)
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const d1 = c.env.DB
    const statements: D1PreparedStatement[] = []
    if (body.remove.length > 0) {
      const refs = body.remove.map((r) => ({
        kind: r.kind,
        key: r.key,
        owner: r.kind === 'weapon' ? r.owner : '',
      }))
      statements.push(
        d1
          .prepare(
            `DELETE FROM planner_targets
             WHERE account_id = ?1 AND EXISTS (
               SELECT 1 FROM json_each(?2) r
               WHERE json_extract(r.value, '$.kind') = planner_targets.kind
                 AND json_extract(r.value, '$.key') = planner_targets.key
                 AND json_extract(r.value, '$.owner') = planner_targets.owner)`,
          )
          .bind(id, JSON.stringify(refs)),
      )
    }
    if (body.upsert.length > 0) {
      const rows = body.upsert.map((t) => ({
        kind: t.kind,
        key: t.key,
        owner: t.kind === 'weapon' ? t.owner : '',
        target: t.target,
      }))
      statements.push(
        d1
          .prepare(
            `INSERT INTO planner_targets (account_id, kind, key, owner, target, updated_at)
             SELECT ?1, json_extract(value, '$.kind'), json_extract(value, '$.key'),
                    json_extract(value, '$.owner'), json_extract(value, '$.target'), ?2
             FROM json_each(?3) WHERE true
             ON CONFLICT (account_id, kind, key, owner)
             DO UPDATE SET target = excluded.target, updated_at = excluded.updated_at`,
          )
          .bind(id, Date.now(), JSON.stringify(rows)),
      )
    }
    const results = await d1.batch([
      ...statements,
      d1.prepare(SELECT_TARGETS).bind(id),
      listenerStatement(d1, id),
    ])
    const rows = (results.at(-2)!.results ?? []) as unknown as TargetRow[]
    notifyUser(
      c,
      c.get('userId'),
      { type: 'planner', accountId: id, ...senderTab(c) },
      listenerOf(results.at(-1)),
    )
    return c.json<PlannerTargetsResponse>({ targets: toTargets(rows) })
  })

  .get('/:id/planner-state', async (c) => {
    const id = idParam(c, 'id')
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const d1 = c.env.DB
    const [captured, adjustments, overrides] = await d1.batch([
      d1.prepare(`SELECT ${CAPTURED} AS captured`).bind(id),
      d1.prepare(SELECT_ADJUSTMENTS).bind(id),
      d1.prepare(SELECT_OVERRIDES).bind(id),
    ])
    return c.json<PlannerStateResponse>(plannerState(captured, adjustments, overrides))
  })

  /**
   * Hand edits, all or nothing: every write is conditional on `base` still
   * being the newest capture, in the same batch, so a capture that lands
   * first turns the request into a 409 with nothing written.
   */
  .patch('/:id/planner-state', async (c) => {
    const id = idParam(c, 'id')
    const body = await parseJson(c, plannerStatePatch)
    await assertOwnsAccount(getDb(c.env.DB), c.get('userId'), id)
    const d1 = c.env.DB
    const now = Date.now()
    const when = `${CAPTURED} = ?2`
    const statements: D1PreparedStatement[] = [
      // Edits a newer capture has replaced.
      d1
        .prepare(
          `DELETE FROM inventory_adjustments
           WHERE account_id = ?1 AND base_seen_at < ?2 AND ${when}`,
        )
        .bind(id, body.base),
    ]
    const sets = body.inventory
      .filter((change) => change.set !== undefined)
      .map((change) => ({ key: change.key, set: change.set ?? null, add: change.add ?? 0 }))
    const adds = body.inventory
      .filter((change) => change.set === undefined)
      .map((change) => ({ key: change.key, add: change.add ?? 0 }))
    if (sets.length > 0) {
      statements.push(
        d1
          .prepare(
            `INSERT INTO inventory_adjustments
               (account_id, key, delta, set_value, base_seen_at, updated_at)
             SELECT ?1, json_extract(value, '$.key'), json_extract(value, '$.add'),
                    json_extract(value, '$.set'), ?2, ?3
             FROM json_each(?4) WHERE ${when}
             ON CONFLICT (account_id, key) DO UPDATE SET
               delta = excluded.delta, set_value = excluded.set_value,
               base_seen_at = excluded.base_seen_at, updated_at = excluded.updated_at`,
          )
          .bind(id, body.base, now, JSON.stringify(sets)),
      )
    }
    if (adds.length > 0) {
      statements.push(
        d1
          .prepare(
            `INSERT INTO inventory_adjustments
               (account_id, key, delta, set_value, base_seen_at, updated_at)
             SELECT ?1, json_extract(value, '$.key'), json_extract(value, '$.add'), NULL, ?2, ?3
             FROM json_each(?4) WHERE ${when}
             ON CONFLICT (account_id, key) DO UPDATE SET
               delta = max(-1000000000000, min(1000000000000,
                 inventory_adjustments.delta + excluded.delta)),
               base_seen_at = excluded.base_seen_at, updated_at = excluded.updated_at`,
          )
          .bind(id, body.base, now, JSON.stringify(adds)),
      )
    }
    if (body.inventory.length > 0) {
      // An edit that adds up to nothing is no edit.
      statements.push(
        d1
          .prepare(
            `DELETE FROM inventory_adjustments
             WHERE account_id = ?1 AND set_value IS NULL AND delta = 0`,
          )
          .bind(id),
      )
    }
    if (body.current.length > 0) {
      const rows = body.current.map((o) => ({
        kind: o.kind,
        key: o.key,
        owner: o.kind === 'weapon' ? o.owner : '',
        current: o.current,
      }))
      const match = `json_extract(r.value, '$.kind') = planner_targets.kind
        AND json_extract(r.value, '$.key') = planner_targets.key
        AND json_extract(r.value, '$.owner') = planner_targets.owner`
      // Goals only: an override for a goal removed meanwhile has nothing to land on.
      statements.push(
        d1
          .prepare(
            `UPDATE planner_targets
             SET current = (SELECT json_extract(r.value, '$.current') FROM json_each(?3) AS r
                            WHERE ${match})
             WHERE account_id = ?1 AND ${when}
               AND EXISTS (SELECT 1 FROM json_each(?3) AS r WHERE ${match})`,
          )
          .bind(id, body.base, JSON.stringify(rows)),
      )
    }
    const results = await d1.batch([
      ...statements,
      d1.prepare(`SELECT ${CAPTURED} AS captured`).bind(id),
      d1.prepare(SELECT_ADJUSTMENTS).bind(id),
      d1.prepare(SELECT_OVERRIDES).bind(id),
      listenerStatement(d1, id),
    ])
    const [captured, adjustments, overrides, listener] = results.slice(-4)
    const state = plannerState(captured, adjustments, overrides)
    if ((state.capturedAt ?? 0) !== body.base) {
      throw new ApiError(409, 'capture_changed', 'A newer capture arrived; nothing was changed')
    }
    notifyUser(
      c,
      c.get('userId'),
      { type: 'planner', accountId: id, ...senderTab(c) },
      listenerOf(listener),
    )
    return c.json<PlannerStateResponse>(state)
  })
