/**
 * GET /api/domain-events: the domain event windows staff set on the staff
 * dashboard (Site → Domain events), for runs the game data
 * (`@gdt/game-data/events`) has not caught up with. Public and cacheable: it
 * holds dates, nothing about anyone. The app merges it with the game data's
 * list (`src/data/domain-events.ts`).
 */

import type { DomainEventsResponse } from '@gdt/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { staffDomainEvents } from '../services/staff-deps'

export const domainEvents = new Hono<AppEnv>().get('/', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json<DomainEventsResponse>({ events: await staffDomainEvents(c.env.DB) })
})
