/**
 * GET /api/domain-events: the domain event windows staff set on the staff
 * dashboard (Site → Domain events), for runs the game data
 * (`@gdt/game-data/events`) has not caught up with, and those irminsul saw in
 * the game's own schedule, per server. Public and cacheable: it holds dates,
 * nothing about anyone. The app merges it with the game data's
 * list (`src/data/domain-events.ts`).
 */

import type { DomainEventsResponse } from '@gdt/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { observedWindows } from '../services/observed-events'
import { staffDomainEvents } from '../services/staff-deps'

export const domainEvents = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  const [events, observed] = await Promise.all([
    staffDomainEvents(c.env.DB),
    observedWindows(c.env.DB),
  ])
  return c.json<DomainEventsResponse>({ events, observed })
})
