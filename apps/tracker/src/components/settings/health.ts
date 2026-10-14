/**
 * The public tier of GET /api/health (see worker/routes/health.ts).
 *
 * Fetched directly rather than through `request()`: the endpoint answers 503
 * when the database is unreachable, and that response still carries the
 * report this screen wants to show. It needs no session, so no cookies go.
 */

import { t } from '@/i18n'

export interface HealthReport {
  status: 'ok' | 'degraded'
  build: { version: string; commit: string; dirty: boolean; builtAt: string } | null
  db: 'ok' | 'error'
  schema: { applied: number; expected: number | null; pending: string[] }
  time: string
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

export async function loadHealth(): Promise<HealthReport> {
  let response: Response
  try {
    response = await fetch('/api/health', { cache: 'no-store', credentials: 'omit' })
  } catch {
    throw new Error(t('settings.build.offline'))
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
  return body
}
