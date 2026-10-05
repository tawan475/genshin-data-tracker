/**
 * The one way the app talks to /api.
 *
 * - Same-origin cookies carry the session; no token is ever in JavaScript.
 * - Every state-changing request sends `x-gdt-csrf: 1` (the Worker refuses
 *   cookie-authed writes without it).
 * - An expired access cookie (401) triggers one refresh, shared by every
 *   request that hit it at once, then a single retry. If the refresh fails the
 *   session is over and `onSignedOut` runs.
 * - Errors become ApiRequestError with the server's `code`, which is what
 *   callers branch on; `message` is safe to show.
 */

import type { ApiError } from '@gdt/shared'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }

  /** First validation message for a field, for inline form errors. */
  issueFor(path: string): string | undefined {
    return this.issues.find((issue) => issue.path === path)?.message
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown
  body?: BodyInit | null
  /** Skip the refresh-and-retry dance (used by the auth endpoints themselves). */
  noRefresh?: boolean
}

let signedOutHandler: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

/** Called once when a refresh fails: the session is gone. */
export function onSignedOut(handler: () => void): void {
  signedOutHandler = handler
}

const SAFE = new Set(['GET', 'HEAD'])
const REFRESHABLE = new Set(['unauthenticated', 'token_expired'])

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (!SAFE.has(method)) headers.set('x-gdt-csrf', '1')
  let body = options.body
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.json)
  }
  return fetch(path, { ...options, method, headers, body, credentials: 'same-origin' })
}

/** Refreshes the access cookie once for any number of concurrent callers. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function toError(response: Response): Promise<ApiRequestError> {
  let body: Partial<ApiError> = {}
  try {
    body = (await response.json()) as ApiError
  } catch {
    // Not JSON (e.g. a proxy error page).
  }
  const error = body.error
  return new ApiRequestError(
    response.status,
    error?.code ?? `http_${response.status}`,
    error?.message ?? (response.status >= 500 ? 'The server had a problem' : 'Request failed'),
    error?.issues,
  )
}

/** Sends a request, refreshing the session once on an expired token. */
export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  let response: Response
  try {
    response = await send(path, options)
  } catch {
    throw new ApiRequestError(0, 'network', 'Could not reach the server. Check your connection.')
  }
  if (response.status !== 401 || options.noRefresh) {
    if (!response.ok && response.status !== 304) throw await toError(response)
    return response
  }

  const error = await toError(response)
  if (!REFRESHABLE.has(error.code)) throw error
  if (!(await refreshSession())) {
    signedOutHandler?.()
    throw error
  }
  const retry = await send(path, options)
  if (!retry.ok && retry.status !== 304) {
    const retryError = await toError(retry)
    if (retry.status === 401) signedOutHandler?.()
    throw retryError
  }
  return retry
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
