import {
  OAUTH_PROVIDER_LABELS,
  USER_SETTINGS_DEFAULTS,
  changePasswordRequest,
  deepMerge,
  loginRequest,
  registerRequest,
  setPasswordRequest,
  updateProfileRequest,
  type IdentitiesResponse,
  type MeResponse,
} from '@gdt/shared'
import { and, eq, or } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { z } from 'zod'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { emailEnabled, emailFeatures, linkOrigin, sendMail, signInAddedMail } from '../lib/email'
import { ApiError, clientIp, isUniqueViolation, notFound, parseJson, rateLimit } from '../lib/http'
import { clearPendingCookie, enabledProviders, isProvider } from '../lib/oauth'
import { hashPassword, verifyPassword } from '../lib/password'
import {
  clearSessionCookies,
  refreshSession,
  requireUser,
  revokeAllSessions,
  startSession,
} from '../lib/session'
import { closeResetLinks, mailVerification } from '../services/auth-tokens'
import { listIdentities, unlinkIdentity } from '../services/identities'

type User = typeof users.$inferSelect

/** Argon2's secret input; see lib/password. */
export function pepper(c: Context<AppEnv>): string {
  const secret = c.env.PASSWORD_PEPPER
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'misconfigured', 'Server is missing PASSWORD_PEPPER')
  }
  return secret
}

export function toMe(user: User, env: Env): MeResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    settings: deepMerge(USER_SETTINGS_DEFAULTS, user.settings),
    hasImportKey: user.importKeyHash !== null,
    emailEnabled: emailEnabled(env),
    emailFeatures: emailFeatures(env),
    hasPassword: user.passwordHash !== '',
  }
}

/**
 * Mails a confirmation link for a just-set email after the response. Best
 * effort: skipped past the per-IP limit (sign-ups could otherwise mail any
 * number of strangers), and Settings can always send another.
 */
export function confirmEmailLater(c: Context<AppEnv>, user: User): void {
  if (!user.email || user.emailVerified || !emailEnabled(c.env)) return
  const target = { id: user.id, email: user.email }
  const origin = linkOrigin(c.env, c.req.url)
  const limiter = c.env.RECOVERY_LIMITER
  c.executionCtx.waitUntil(
    (async () => {
      if (limiter && !(await limiter.limit({ key: `confirm:${clientIp(c)}` })).success) return
      await mailVerification(c.env, target, origin)
    })().catch((error: unknown) => console.error('verify-email mail', String(error).slice(0, 120))),
  )
}

async function findByLogin(c: Context<AppEnv>, login: string): Promise<User | undefined> {
  const [user] = await getDb(c.env.DB)
    .select()
    .from(users)
    .where(or(eq(users.usernameKey, login), eq(users.email, login)))
    .limit(1)
  return user
}

const invalidCredentials = () =>
  new ApiError(401, 'invalid_credentials', 'Wrong username, email or password')

/** Sign-up while the email features are off: an `email` sent anyway is dropped, not refused. */
const registerWithoutEmail = registerRequest.omit({ email: true })

/**
 * Checks a username-or-email and password (rate limited per IP and per name;
 * an account without a password never matches), upgrading an old hash.
 * Starts no session: the caller does.
 */
export async function passwordSignIn(
  c: Context<AppEnv>,
  body: z.output<typeof loginRequest>,
): Promise<User> {
  await rateLimit(c.env.AUTH_LIMITER, `login:${clientIp(c)}`)
  await rateLimit(c.env.AUTH_LIMITER, `login:${body.login}`)
  const user = await findByLogin(c, body.login)
  const check = verifyPassword(body.password, user?.passwordHash, pepper(c))
  if (!user || !check.ok) throw invalidCredentials()
  if (check.rehash) {
    // Hashed under older Argon2 parameters: upgrade while the password is at hand.
    await getDb(c.env.DB)
      .update(users)
      .set({ passwordHash: hashPassword(body.password, pepper(c)) })
      .where(eq(users.id, user.id))
  }
  return user
}

/**
 * Mails "<what> can now sign in to your account" to a confirmed email, after
 * the response. Best effort, like every notice.
 */
export function notifySignInAdded(c: Context<AppEnv>, user: User, what: string): void {
  if (!user.email || !user.emailVerified || !emailEnabled(c.env)) return
  c.executionCtx.waitUntil(
    sendMail(
      c.env,
      signInAddedMail(user.email, linkOrigin(c.env, c.req.url), user.username, what),
    ).then(() => undefined),
  )
}

export const auth = new Hono<AppEnv>()
  /**
   * While the email features are off, an `email` is ignored (not even
   * validated): the app no longer asks for one, and a page cached from
   * before still signs up, without it, rather than failing.
   */
  .post('/register', async (c) => {
    await rateLimit(c.env.AUTH_LIMITER, `register:${clientIp(c)}`)
    const body = emailFeatures(c.env)
      ? await parseJson(c, registerRequest)
      : { ...(await parseJson(c, registerWithoutEmail)), email: null }
    let user: User
    try {
      ;[user] = (await getDb(c.env.DB)
        .insert(users)
        .values({
          username: body.username,
          usernameKey: body.username.toLowerCase(),
          email: body.email ?? null,
          passwordHash: hashPassword(body.password, pepper(c)),
        })
        .returning()) as [User]
    } catch (error) {
      if (isUniqueViolation(error, 'users')) {
        throw new ApiError(409, 'taken', 'That username or email is already registered')
      }
      throw error
    }
    clearPendingCookie(c)
    await startSession(c, user)
    confirmEmailLater(c, user)
    return c.json(toMe(user, c.env), 201)
  })

  .post('/login', async (c) => {
    const user = await passwordSignIn(c, await parseJson(c, loginRequest))
    // A provider account left waiting in this browser is not this user's to link.
    clearPendingCookie(c)
    await startSession(c, user)
    return c.json(toMe(user, c.env))
  })

  .post('/refresh', async (c) => {
    await refreshSession(c)
    return c.body(null, 204)
  })

  /** Signs this device out. */
  .post('/logout', (c) => {
    clearSessionCookies(c)
    clearPendingCookie(c)
    return c.body(null, 204)
  })

  /** Signs every device out, this one included. */
  .post('/logout-all', requireUser, async (c) => {
    await revokeAllSessions(c, c.get('userId'))
    clearSessionCookies(c)
    return c.body(null, 204)
  })

  .get('/me', requireUser, async (c) => {
    const [user] = await getDb(c.env.DB)
      .select()
      .from(users)
      .where(eq(users.id, c.get('userId')))
    if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
    return c.json(toMe(user, c.env))
  })

  /**
   * Changes the username and/or email (the user chose not to ask for the
   * password here). While the email features are off, the email can only be
   * removed: another address is 403 `email_paused`.
   */
  .patch('/profile', requireUser, async (c) => {
    const userId = c.get('userId')
    await rateLimit(c.env.AUTH_LIMITER, `profile:${userId}`)
    const body = await parseJson(c, updateProfileRequest)
    const db = getDb(c.env.DB)
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
    const changes: Partial<typeof users.$inferInsert> = {}
    if (body.username !== undefined && body.username !== user.username) {
      changes.username = body.username
      changes.usernameKey = body.username.toLowerCase()
    }
    if (body.email !== undefined && body.email !== user.email) {
      if (body.email !== null && !emailFeatures(c.env)) {
        throw new ApiError(403, 'email_paused', "An email can't be added or changed right now")
      }
      changes.email = body.email
      // Verification belongs to the address, not the account.
      changes.emailVerified = false
    }
    if (Object.keys(changes).length === 0) return c.json(toMe(user, c.env))
    try {
      const [updated] = (await db
        .update(users)
        .set(changes)
        .where(eq(users.id, userId))
        .returning()) as [User]
      if (changes.email !== undefined) {
        // Reset links mailed to the old address die with it; the new one gets a confirmation.
        await closeResetLinks(c.env.DB, userId, { mailedOnly: true })
        confirmEmailLater(c, updated)
      }
      return c.json(toMe(updated, c.env))
    } catch (error) {
      if (isUniqueViolation(error, 'users.username_key')) {
        throw new ApiError(409, 'username_taken', 'That username is taken')
      }
      if (isUniqueViolation(error, 'users.email')) {
        throw new ApiError(409, 'email_taken', 'That email is already registered')
      }
      throw error
    }
  })

  /**
   * Changing the password signs every other device out (this one stays signed
   * in) and ends any open reset link.
   */
  .post('/password', requireUser, async (c) => {
    const userId = c.get('userId')
    await rateLimit(c.env.AUTH_LIMITER, `password:${userId}`)
    const body = await parseJson(c, changePasswordRequest)
    const [user] = await getDb(c.env.DB).select().from(users).where(eq(users.id, userId))
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash, pepper(c)).ok) {
      throw invalidCredentials()
    }
    const updated = await revokeAllSessions(c, userId, {
      passwordHash: hashPassword(body.newPassword, pepper(c)),
    })
    await closeResetLinks(c.env.DB, userId)
    await startSession(c, updated)
    return c.body(null, 204)
  })

  /**
   * A first password for an account made with Discord or Google: only a
   * session, no current password (there is none). Ends any open reset link;
   * signs no one out (nothing was replaced).
   */
  .post('/password/set', requireUser, async (c) => {
    const userId = c.get('userId')
    await rateLimit(c.env.AUTH_LIMITER, `password:${userId}`)
    const body = await parseJson(c, setPasswordRequest)
    const passwordHash = hashPassword(body.password, pepper(c))
    // Conditional, so it can never stand in for "change password" without the current one.
    const [user] = (await getDb(c.env.DB)
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, userId), eq(users.passwordHash, '')))
      .returning()) as User[]
    if (!user) throw new ApiError(409, 'has_password', 'This account already has a password')
    await closeResetLinks(c.env.DB, userId)
    notifySignInAdded(c, user, 'A password')
    return c.json(toMe(user, c.env))
  })

  /** Sign-in providers on this server, and the ones linked to this user. */
  .get('/identities', requireUser, async (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({
      providers: enabledProviders(c.env, c.req.url),
      identities: await listIdentities(c.env.DB, c.get('userId')),
    } satisfies IdentitiesResponse)
  })

  /** Unlinks a provider, unless it is the account's last way in (409 `last_sign_in`). */
  .delete('/identities/:provider', requireUser, async (c) => {
    const provider = c.req.param('provider')
    if (!isProvider(provider)) throw notFound('Identity')
    const userId = c.get('userId')
    await rateLimit(c.env.AUTH_LIMITER, `identity:${userId}`)
    const outcome = await unlinkIdentity(c.env.DB, userId, provider)
    if (outcome === 'missing') throw notFound('Identity')
    if (outcome === 'last') {
      throw new ApiError(
        409,
        'last_sign_in',
        `Set a password or link another account before unlinking ${OAUTH_PROVIDER_LABELS[provider]}`,
      )
    }
    return c.body(null, 204)
  })
