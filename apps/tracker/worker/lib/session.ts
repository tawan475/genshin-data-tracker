/**
 * Cookie sessions. Both tokens are HS256 JWTs with a `typ` claim, so neither
 * can stand in for the other.
 *
 * - Access: 15 minutes in `gdt_at` (path /api). Verifying it needs no
 *   database read, so ordinary requests cost nothing for auth.
 * - Refresh: 30 days in `gdt_rt` (path /api/auth, SameSite Strict). It carries
 *   the user's `token_version`; a refresh reads that one column and reissues
 *   both tokens, so a device in use stays signed in. Bumping the version
 *   (password change, "sign out everywhere") invalidates every refresh token
 *   at once; access tokens already out lapse within 15 minutes. Signing out
 *   one device clears its cookies; its tokens are not tracked server-side.
 *
 * Both cookies are HttpOnly: page scripts never see a token. Cookie-authed
 * requests that change state must also send `x-gdt-csrf: 1`; a cross-site page
 * cannot add a custom header without a CORS preflight, which this API never
 * grants.
 */

import { eq, sql } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { JWTPayload } from 'hono/utils/jwt/types'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
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
const REFRESH_TTL_S = 30 * 24 * 60 * 60

export const CSRF_HEADER = 'x-gdt-csrf'

type TokenType = 'access' | 'refresh'

function jwtSecret(c: Context<AppEnv>): string {
  const secret = c.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'misconfigured', 'Server is missing JWT_SECRET')
  }
  return secret
}

/** The verified payload of a cookie token of this type, or null. */
async function readToken(
  c: Context<AppEnv>,
  cookie: string,
  typ: TokenType,
): Promise<JWTPayload | null> {
  const token = getCookie(c, cookie)
  if (!token) return null
  const secret = jwtSecret(c)
  try {
    const payload = await verify(token, secret, 'HS256')
    return payload.typ === typ ? payload : null
  } catch {
    return null
  }
}

/** Signs a user in on this device: fresh access and refresh cookies. */
export async function startSession(
  c: Context<AppEnv>,
  user: { id: number; tokenVersion: number },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const secret = jwtSecret(c)
  const sub = String(user.id)
  const [access, refresh] = await Promise.all([
    sign({ sub, typ: 'access', iat: now, exp: now + ACCESS_TTL_S }, secret, 'HS256'),
    sign(
      { sub, typ: 'refresh', ver: user.tokenVersion, iat: now, exp: now + REFRESH_TTL_S },
      secret,
      'HS256',
    ),
  ])
  setCookie(c, ACCESS_COOKIE, access, {
    path: '/api',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: ACCESS_TTL_S,
  })
  setCookie(c, REFRESH_COOKIE, refresh, {
    path: '/api/auth',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: REFRESH_TTL_S,
  })
  setCookie(c, HINT_COOKIE, '1', {
    path: '/',
    secure: true,
    sameSite: 'Lax',
    maxAge: REFRESH_TTL_S,
  })
}

export function clearSessionCookies(c: Context<AppEnv>): void {
  deleteCookie(c, ACCESS_COOKIE, { path: '/api', secure: true })
  deleteCookie(c, REFRESH_COOKIE, { path: '/api/auth', secure: true })
  deleteCookie(c, HINT_COOKIE, { path: '/', secure: true })
}

/** Exchanges a valid refresh cookie for new tokens. One D1 read, no writes. */
export async function refreshSession(c: Context<AppEnv>): Promise<void> {
  if (!getCookie(c, REFRESH_COOKIE)) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  const payload = await readToken(c, REFRESH_COOKIE, 'refresh')
  if (!payload) {
    clearSessionCookies(c)
    throw new ApiError(401, 'session_expired', 'Session expired, sign in again')
  }
  const id = Number(payload.sub)
  const [user] = await getDb(c.env.DB)
    .select({ id: users.id, tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, id))
  if (!user || user.tokenVersion !== payload.ver) {
    clearSessionCookies(c)
    throw new ApiError(401, 'session_revoked', 'Session ended, sign in again')
  }
  await startSession(c, user)
}

/**
 * Invalidates every refresh token the user holds, on all devices. Returns the
 * user with the new version, so the caller can sign this device back in.
 */
export async function revokeAllSessions(
  c: Context<AppEnv>,
  userId: number,
  set: Partial<typeof users.$inferInsert> = {},
): Promise<{ id: number; tokenVersion: number }> {
  const [user] = await getDb(c.env.DB)
    .update(users)
    .set({ ...set, tokenVersion: sql`${users.tokenVersion} + 1` })
    .where(eq(users.id, userId))
    .returning({ id: users.id, tokenVersion: users.tokenVersion })
  if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  return user
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Requires a valid access cookie; sets `userId`. */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header(CSRF_HEADER) !== '1') {
    throw new ApiError(403, 'csrf', `Missing ${CSRF_HEADER} header`)
  }
  if (!getCookie(c, ACCESS_COOKIE)) throw new ApiError(401, 'unauthenticated', 'Not signed in')
  const payload = await readToken(c, ACCESS_COOKIE, 'access')
  if (!payload) throw new ApiError(401, 'token_expired', 'Access token expired')
  c.set('userId', Number(payload.sub))
  await next()
}
