/**
 * Cookie sessions.
 *
 * - Access: a 15-minute HS256 JWT in `gdt_at` (path /api). Verifying it needs
 *   no database read, so ordinary requests cost nothing for auth.
 * - Refresh: an opaque 32-byte token in `gdt_rt` (path /api/auth, SameSite
 *   Strict). D1 stores only its SHA-256 as the session id. Every refresh
 *   rotates it; the replaced hash stays valid for a short grace window so two
 *   tabs refreshing at once do not log each other out.
 *
 * Both cookies are HttpOnly: page scripts never see a token. Cookie-authed
 * requests that change state must also send `x-gdt-csrf: 1`; a cross-site page
 * cannot add a custom header without a CORS preflight, which this API never
 * grants.
 */

import { and, eq, gt, or } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { getDb } from '../db/client'
import { sessions } from '../db/schema'
import type { AppEnv } from '../env'
import { randomToken, sha256Hex } from './crypto'
import { ApiError } from './http'

const ACCESS_COOKIE = 'gdt_at'
const REFRESH_COOKIE = 'gdt_rt'
/**
 * Not a credential: a readable "this browser has a session" flag, so the app
 * can skip asking /api/auth/me (and refreshing) for visitors who never signed
 * in. Its absence only means "don't bother asking"; the server never trusts it.
 */
const HINT_COOKIE = 'gdt_s'
const ACCESS_TTL_S = 15 * 60
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ROTATION_GRACE_MS = 60 * 1000

export const CSRF_HEADER = 'x-gdt-csrf'

function jwtSecret(c: Context<AppEnv>): string {
  const secret = c.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'misconfigured', 'Server is missing JWT_SECRET')
  }
  return secret
}

async function setAccessCookie(c: Context<AppEnv>, userId: number): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TTL_S
  const token = await sign({ sub: String(userId), exp }, jwtSecret(c), 'HS256')
  setCookie(c, ACCESS_COOKIE, token, {
    path: '/api',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: ACCESS_TTL_S,
  })
}

function setRefreshCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, REFRESH_COOKIE, token, {
    path: '/api/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: REFRESH_TTL_MS / 1000,
  })
  setCookie(c, HINT_COOKIE, '1', {
    path: '/',
    secure: true,
    sameSite: 'Lax',
    maxAge: REFRESH_TTL_MS / 1000,
  })
}

export function clearSessionCookies(c: Context<AppEnv>): void {
  deleteCookie(c, ACCESS_COOKIE, { path: '/api', secure: true })
  deleteCookie(c, REFRESH_COOKIE, { path: '/api/auth', secure: true })
  deleteCookie(c, HINT_COOKIE, { path: '/', secure: true })
}

/** Signs a user in on this device. */
export async function startSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = randomToken()
  await getDb(c.env.DB)
    .insert(sessions)
    .values({
      id: await sha256Hex(token),
      userId,
      userAgent: c.req.header('user-agent')?.slice(0, 256) ?? null,
      expiresAt: Date.now() + REFRESH_TTL_MS,
    })
  await setAccessCookie(c, userId)
  setRefreshCookie(c, token)
}

/** Exchanges the refresh cookie for a fresh access cookie, rotating it. */
export async function refreshSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, REFRESH_COOKIE)
  if (!token) throw new ApiError(401, 'unauthenticated', 'Not signed in')

  const db = getDb(c.env.DB)
  const now = Date.now()
  const hash = await sha256Hex(token)
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(or(eq(sessions.id, hash), eq(sessions.previousId, hash)), gt(sessions.expiresAt, now)),
    )
    .limit(1)

  if (!session) {
    clearSessionCookies(c)
    throw new ApiError(401, 'session_expired', 'Session expired, sign in again')
  }

  if (session.id === hash) {
    const next = randomToken()
    await db
      .update(sessions)
      .set({
        id: await sha256Hex(next),
        previousId: hash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: now + REFRESH_TTL_MS,
      })
      .where(eq(sessions.id, hash))
    setRefreshCookie(c, next)
  } else if ((session.rotatedAt ?? 0) < now - ROTATION_GRACE_MS) {
    // A replaced token presented long after its rotation: it was copied.
    // End the session everywhere rather than guess which holder is genuine.
    await db.delete(sessions).where(eq(sessions.id, session.id))
    clearSessionCookies(c)
    throw new ApiError(401, 'session_revoked', 'Session ended, sign in again')
  }
  // Within the grace window the browser already holds the new refresh
  // cookie from the concurrent rotation; only the access cookie is reissued.

  await setAccessCookie(c, session.userId)
}

/** Signs this device out. */
export async function endSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, REFRESH_COOKIE)
  if (token) {
    const hash = await sha256Hex(token)
    await getDb(c.env.DB)
      .delete(sessions)
      .where(or(eq(sessions.id, hash), eq(sessions.previousId, hash)))
  }
  clearSessionCookies(c)
}

/** Signs the user out everywhere. */
export async function endAllSessions(c: Context<AppEnv>, userId: number): Promise<void> {
  await getDb(c.env.DB).delete(sessions).where(eq(sessions.userId, userId))
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Requires a valid access cookie; sets `userId`. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(CSRF_HEADER) !== '1') {
    throw new ApiError(403, 'csrf', `Missing ${CSRF_HEADER} header`)
  }
  const token = getCookie(c, ACCESS_COOKIE)
  if (!token) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  try {
    const payload = await verify(token, jwtSecret(c), 'HS256')
    c.set('userId', Number(payload.sub))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(401, 'token_expired', 'Access token expired')
  }
  await next()
}
