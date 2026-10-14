/**
 * The game's events for the planner (docs/plans/game-events.md), public and
 * cacheable (dates only, nothing about anyone):
 * - `GET /api/game-events?server=ASIA`: domain event windows (game data,
 *   staff, HoYoLAB posts, the banner rule) and the notice board's events
 *   and wishes for that server (services/game-events.ts).
 * - `GET /api/domain-events`: the domain windows alone, as app builds from
 *   before game-events read them (Asia's when no server is named; the
 *   windows are server local times, the same text on every server).
 */

import {
  NOTICE_REGIONS,
  type DomainEventsResponse,
  type GameEventsResponse,
  type NoticeServer,
} from '@gdt/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { gameEventsFor } from '../services/game-events'

const serverOf = (value: string | undefined): NoticeServer =>
  value && value in NOTICE_REGIONS ? (value as NoticeServer) : 'ASIA'

export const domainEvents = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  const { domain } = await gameEventsFor(c.env.DB, serverOf(c.req.query('server')))
  return c.json<DomainEventsResponse>({ events: domain })
})

export const gameEvents = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json<GameEventsResponse>(await gameEventsFor(c.env.DB, serverOf(c.req.query('server'))))
})
