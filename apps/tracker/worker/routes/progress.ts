/**
 * Per-account progress the player sets by hand: achievements marked done and
 * planner goals. Neither touches snapshots, so `dataVersion` (and with it
 * every cached bundle) stays put.
 *
 * Writes go through `json_each` so a bulk change (a Seelie import is a few
 * hundred rows) is one statement, and each request is a single D1 batch:
 * the writes followed by the read that answers it.
 */

import {
  achievementMarksPatch,
  plannerTargetsPatch,
  type AchievementMarksResponse,
  type PlannerTarget,
  type PlannerTargetsResponse,
} from '@gdt/shared'
import { Hono } from 'hono'
import { getDb } from '../db/client'
import type { AppEnv } from '../env'
import { idParam, parseJson } from '../lib/http'
import { requireUser } from '../lib/session'
import { assertOwnsAccount } from '../services/accounts'

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
    const results = await d1.batch([...statements, d1.prepare(SELECT_TARGETS).bind(id)])
    const rows = (results.at(-1)!.results ?? []) as unknown as TargetRow[]
    return c.json<PlannerTargetsResponse>({ targets: toTargets(rows) })
  })
