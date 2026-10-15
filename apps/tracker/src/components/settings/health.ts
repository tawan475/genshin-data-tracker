/**
 * The public tier of GET /api/health (see worker/routes/health.ts).
 *
 * Fetched directly rather than through `request()`: the endpoint answers 503
 * when the database is unreachable, and that response still carries the
 * report this screen wants to show. It needs no session, so no cookies go.
 */

import { t } from '@/i18n'
import { serverTiming } from '@/lib/server-timing'

export interface HealthReport {
  status: 'ok' | 'degraded'
  build: { version: string; commit: string; dirty: boolean; builtAt: string } | null
  db: 'ok' | 'error'
  schema: { applied: number; expected: number | null; pending: string[] }
  time: string
}

/** How long the health check took, from this browser and on the server. */
export interface HealthTiming {
  /** The whole request as this browser saw it, ms. */
  roundTrip: number
  /** The Worker's own time on it (Server-Timing `total`), ms. */
  server: number | null
  /** Its one database round trip (Server-Timing `d1`), ms. */
  d1: number | null
  /** Where the Worker ran (Cloudflare's `cf-placement`: `local-BKK`, `remote-SIN`). */
  placement: string | null
}

function isHealthReport(value: unknown): value is HealthReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<HealthReport>
  return (
    typeof report.status === 'string' &&
    typeof report.db === 'string' &&
    !!report.schema &&
    typeof report.schema.applied === 'number' &&
    Array.isArray(report.schema.pending)
  )
}

export async function loadHealth(): Promise<HealthReport & { timing: HealthTiming }> {
  let response: Response
  const started = performance.now()
  try {
    response = await fetch('/api/health', { cache: 'no-store', credentials: 'omit' })
  } catch {
    throw new Error(t('settings.build.offline'))
  }
  const timings = response.headers.get('server-timing')
  const timing: HealthTiming = {
    roundTrip: Math.round(performance.now() - started),
    server: serverTiming(timings, 'total'),
    d1: serverTiming(timings, 'd1'),
    placement: response.headers.get('cf-placement'),
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  if (!isHealthReport(body)) {
    throw new Error(t('settings.build.noReport', { status: response.status }))
  }
  return { ...body, timing }
}
