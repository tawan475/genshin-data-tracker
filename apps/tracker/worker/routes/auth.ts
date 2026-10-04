import {
  PASSWORD_ITERATIONS,
  PASSWORD_SALT_BYTES,
  USER_SETTINGS_DEFAULTS,
  changePasswordRequest,
  deepMerge,
  fromBase64,
  loginRequest,
  preloginRequest,
  registerRequest,
  toBase64,
  type MeResponse,
  type PreloginResponse,
} from '@gdt/shared'
import { eq, or } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import type { AppEnv } from '../env'
import { hmac, hmacBase64, safeEqual } from '../lib/crypto'
import { ApiError, clientIp, isUniqueViolation, parseJson, rateLimit } from '../lib/http'
import {
  endAllSessions,
  endSession,
  refreshSession,
  requireUser,
  startSession,
} from '../lib/session'

type User = typeof users.$inferSelect

function pepper(c: Context<AppEnv>): string {
  const secret = c.env.PASSWORD_PEPPER
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'misconfigured', 'Server is missing PASSWORD_PEPPER')
  }
  return secret
}

/** What is stored for a browser-derived password key. */
function verifierFor(c: Context<AppEnv>, key: string): Promise<string> {
  return hmacBase64(pepper(c), fromBase64(key)!)
}

export function toMe(user: User): MeResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    passwordIterations: user.passwordIterations,
    settings: deepMerge(USER_SETTINGS_DEFAULTS, user.settings),
  }
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
    const verifier = await verifierFor(c, body.key)
    let user: User
    try {
      ;[user] = (await getDb(c.env.DB)
        .insert(users)
        .values({
          username: body.username,
          usernameKey: body.username.toLowerCase(),
          email: body.email ?? null,
          passwordSalt: body.salt,
          passwordIterations: body.iterations,
          passwordVerifier: verifier,
        })
        .returning()) as [User]
    } catch (error) {
      if (isUniqueViolation(error, 'users')) {
        throw new ApiError(409, 'taken', 'That username or email is already registered')
      }
      throw error
    }
    await startSession(c, user.id)
    return c.json(toMe(user), 201)
  })

  .post('/prelogin', async (c) => {
    await rateLimit(c.env.AUTH_LIMITER, `prelogin:${clientIp(c)}`)
    const { login } = await parseJson(c, preloginRequest)
    const user = await findByLogin(c, login)
    if (user) {
      return c.json<PreloginResponse>({
        salt: user.passwordSalt,
        iterations: user.passwordIterations,
      })
    }
    // Unknown logins get a salt that is stable per name, so this endpoint does
    // not reveal which accounts exist.
    const fake = (await hmac(pepper(c), `salt:${login}`)).slice(0, PASSWORD_SALT_BYTES)
    return c.json<PreloginResponse>({ salt: toBase64(fake), iterations: PASSWORD_ITERATIONS })
  })

  .post('/login', async (c) => {
    const body = await parseJson(c, loginRequest)
    await rateLimit(c.env.AUTH_LIMITER, `login:${clientIp(c)}`)
    await rateLimit(c.env.AUTH_LIMITER, `login:${body.login}`)
    const user = await findByLogin(c, body.login)
    const verifier = await verifierFor(c, body.key)
    if (!user || !safeEqual(verifier, user.passwordVerifier)) throw invalidCredentials()
    await startSession(c, user.id)
    return c.json(toMe(user))
  })

  .post('/refresh', async (c) => {
    await refreshSession(c)
    return c.body(null, 204)
  })

  .post('/logout', async (c) => {
    await endSession(c)
    return c.body(null, 204)
  })

  .get('/me', requireUser, async (c) => {
    const [user] = await getDb(c.env.DB)
      .select()
      .from(users)
      .where(eq(users.id, c.get('userId')))
    if (!user) throw new ApiError(401, 'unauthenticated', 'Not signed in')
    return c.json(toMe(user))
  })

  /** Changing the password ends every session, then signs this device back in. */
  .post('/password', requireUser, async (c) => {
    const body = await parseJson(c, changePasswordRequest)
    const db = getDb(c.env.DB)
    const userId = c.get('userId')
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    if (!user || !safeEqual(await verifierFor(c, body.currentKey), user.passwordVerifier)) {
      throw invalidCredentials()
    }
    await db
      .update(users)
      .set({
        passwordSalt: body.salt,
        passwordIterations: body.iterations,
        passwordVerifier: await verifierFor(c, body.key),
      })
      .where(eq(users.id, userId))
    await endAllSessions(c, userId)
    await startSession(c, userId)
    return c.body(null, 204)
  })
