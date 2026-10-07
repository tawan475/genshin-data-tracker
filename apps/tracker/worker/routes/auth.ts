import {
  USER_SETTINGS_DEFAULTS,
  changePasswordRequest,
  deepMerge,
  loginRequest,
  registerRequest,
  updateProfileRequest,
  type MeResponse,
} from '@gdt/shared'
import { eq, or } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { emailEnabled, linkOrigin } from '../lib/email'
import { ApiError, clientIp, isUniqueViolation, parseJson, rateLimit } from '../lib/http'
import { hashPassword, verifyPassword } from '../lib/password'
import {
  clearSessionCookies,
  refreshSession,
  requireUser,
  revokeAllSessions,
  startSession,
} from '../lib/session'
import { closeResetLinks, mailVerification } from '../services/auth-tokens'

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
  }
}

/**
 * Mails a confirmation link for a just-set email after the response. Best
 * effort: skipped past the per-IP limit (sign-ups could otherwise mail any
 * number of strangers), and Settings can always send another.
 */
function confirmEmailLater(c: Context<AppEnv>, user: User): void {
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

export const auth = new Hono<AppEnv>()
  .post('/register', async (c) => {
    await rateLimit(c.env.AUTH_LIMITER, `register:${clientIp(c)}`)
    const body = await parseJson(c, registerRequest)
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
    await startSession(c, user)
    confirmEmailLater(c, user)
    return c.json(toMe(user, c.env), 201)
  })

  .post('/login', async (c) => {
    const body = await parseJson(c, loginRequest)
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

  /** Changes the username and/or email (the user chose not to ask for the password here). */
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
