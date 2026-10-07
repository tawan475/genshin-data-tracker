import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

/**
 * An error the client is meant to see: rendered as `{ error: { code, message } }`,
 * with `headers` (e.g. Retry-After) on the response.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly issues?: { path: string; message: string }[],
    readonly headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found`)

export function errorBody(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.issues ? { issues: error.issues } : {}),
    },
  }
}

/** Parses and validates a JSON body, turning schema failures into a 400. */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON')
  }
  return validate(schema, body)
}

export function validate<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError(
      400,
      'invalid_request',
      'Request failed validation',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }
  return result.data
}

/** Positive integer route parameter, else 404 (an invalid id names nothing). */
export function idParam(c: Context, name: string): number {
  const value = Number(c.req.param(name))
  if (!Number.isSafeInteger(value) || value <= 0) throw notFound()
  return value
}

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'local'
}

/**
 * Applies a Workers rate limiter. The binding is optional so a missing one
 * (e.g. an environment without it) degrades to no limiting rather than errors.
 */
export async function rateLimit(limiter: RateLimit | undefined, key: string): Promise<void> {
  if (!limiter) return
  const { success } = await limiter.limit({ key })
  if (!success) throw new ApiError(429, 'rate_limited', 'Too many requests, slow down')
}

/** True when a (possibly wrapped) D1 error is a UNIQUE violation, optionally on `table`. */
export function isUniqueViolation(error: unknown, table = ''): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes(`UNIQUE constraint failed: ${table}`)) return true
  }
  return false
}
