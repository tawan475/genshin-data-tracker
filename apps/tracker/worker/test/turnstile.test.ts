import type { MeResponse, OAuthProvidersResponse, OAuthStartResponse } from '@gdt/shared'
import { env } from 'cloudflare:test'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import { PENDING_COOKIE, PENDING_TTL_S, seal, type PendingIdentity } from '../lib/oauth'
import { hashPassword } from '../lib/password'
import { SITEVERIFY_URL } from '../lib/turnstile'
import { Client, withEnv } from './client'

const db = getDb(env.DB)
const PASSWORD = 'correct horse battery staple'
const HOST = 'genshin-tracker.475.dev'

/** Made-up keys: the action and hostname are checked for them. */
const KEYS = { TURNSTILE_SITE_KEY: 'test-site-key', TURNSTILE_SECRET_KEY: 'test-secret-key' }
/** Cloudflare's always-pass test keys: their answers carry no action or hostname. */
const TEST_KEYS = {
  TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
}
const OFF = { TURNSTILE_SITE_KEY: undefined, TURNSTILE_SECRET_KEY: undefined }
const DISCORD = {
  DISCORD_CLIENT_ID: 'test-discord-client',
  DISCORD_CLIENT_SECRET: 'test-discord-secret',
}

/**
 * Cloudflare's siteverify, behind the Worker's `fetch`. A token says what to
 * answer: `ok:<action>:<hostname>` passes for that action and host, `no` is
 * refused, `down` a 500, `internal` an internal-error, `secret` a rejected
 * secret, `throw` no answer at all, `test` the test secrets' answer.
 */
class FakeSiteverify {
  requests: Record<string, unknown>[] = []
  other: string[] = []

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    if (request.url !== SITEVERIFY_URL) {
      this.other.push(`${request.method} ${request.url}`)
      return new Response('unexpected request', { status: 599 })
    }
    const body = (await request.json()) as Record<string, unknown>
    this.requests.push(body)
    const token = String(body.response)
    const [kind, action, hostname] = token.split(':')
    switch (kind) {
      case 'ok':
        return Response.json({ success: true, 'error-codes': [], action, hostname })
      case 'test':
        return Response.json({
          success: true,
          'error-codes': [],
          action: '',
          hostname: 'example.com',
        })
      case 'down':
        return new Response('upstream', { status: 500 })
      case 'internal':
        return Response.json({ success: false, 'error-codes': ['internal-error'] })
      case 'secret':
        return Response.json({ success: false, 'error-codes': ['invalid-input-secret'] })
      case 'throw':
        throw new TypeError('network down')
      default:
        return Response.json({ success: false, 'error-codes': ['invalid-input-response'] })
    }
  }
}

let siteverify: FakeSiteverify

beforeEach(() => {
  siteverify = new FakeSiteverify()
  vi.spyOn(globalThis, 'fetch').mockImplementation(siteverify.fetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

let counter = 0
const newName = () => `human${++counter}${crypto.randomUUID().slice(0, 6)}`

async function call(client: Client, path: string, json: unknown) {
  const response = await client.fetch(path, { method: 'POST', json })
  const body = (await response.json().catch(() => null)) as {
    error?: { code: string; message: string }
  } | null
  return { status: response.status, code: body?.error?.code, message: body?.error?.message }
}

const register = (keys: Record<string, unknown>, username: string, turnstile?: string) =>
  call(new Client(withEnv(keys)), '/api/auth/register', {
    username,
    password: PASSWORD,
    ...(turnstile === undefined ? {} : { turnstile }),
  })

const login = (
  keys: Record<string, unknown>,
  name: string,
  turnstile?: string,
  password = PASSWORD,
) =>
  call(new Client(withEnv(keys)), '/api/auth/login', {
    login: name,
    password,
    ...(turnstile === undefined ? {} : { turnstile }),
  })

const userNamed = async (username: string) =>
  (await db.select().from(users).where(eq(users.usernameKey, username.toLowerCase())))[0]

describe('configuration', () => {
  it('is off without both keys: nothing asked, siteverify never called', async () => {
    for (const keys of [
      OFF,
      { ...OFF, TURNSTILE_SITE_KEY: 'only-the-site-key' },
      { ...OFF, TURNSTILE_SECRET_KEY: 'only-the-secret' },
    ]) {
      const username = newName()
      expect(await register(keys, username)).toMatchObject({ status: 201 })
      expect(await login(keys, username)).toMatchObject({ status: 200 })
      const options = await new Client(withEnv(keys)).json<OAuthProvidersResponse>(
        '/api/auth/oauth/providers',
      )
      expect(options.turnstileSiteKey).toBeNull()
    }
    expect(siteverify.requests).toEqual([])
  })

  it('tells the signed-out pages the site key once both are set', async () => {
    const options = await new Client(withEnv(KEYS)).json<OAuthProvidersResponse>(
      '/api/auth/oauth/providers',
    )
    expect(options.turnstileSiteKey).toBe('test-site-key')
  })
})

describe('sign-up', () => {
  it('needs a token that passes for this action and this site, or makes no user', async () => {
    const username = newName()
    expect(await register(KEYS, username)).toEqual({
      status: 400,
      code: 'human_check_required',
      message: 'Reload the page to sign up',
    })
    expect(await register(KEYS, username, 'no')).toMatchObject({
      status: 403,
      code: 'human_check_failed',
    })
    expect(await register(KEYS, username, `ok:login:${HOST}`)).toMatchObject({
      status: 403,
      code: 'human_check_failed',
    })
    expect(await register(KEYS, username, 'ok:register:evil.example')).toMatchObject({
      status: 403,
      code: 'human_check_failed',
    })
    expect(await userNamed(username)).toBeUndefined()

    const client = new Client(withEnv(KEYS))
    const created = await client.fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '203.0.113.9' },
      json: { username, password: PASSWORD, turnstile: `ok:register:${HOST}` },
    })
    expect(created.status).toBe(201)
    expect(await userNamed(username)).toBeDefined()
    expect(siteverify.requests.at(-1)).toEqual({
      secret: 'test-secret-key',
      response: `ok:register:${HOST}`,
      remoteip: '203.0.113.9',
    })
    expect(siteverify.other).toEqual([])
  })

  it('is refused while siteverify cannot answer', async () => {
    for (const token of ['down', 'internal', 'throw', 'secret']) {
      const username = newName()
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await register(KEYS, username, token)).toMatchObject({
        status: 503,
        code: 'human_check_unavailable',
      })
      expect(await userNamed(username)).toBeUndefined()
      // A rejected secret is a configuration fault: said loudly.
      if (token === 'secret')
        expect(error).toHaveBeenCalledWith('turnstile_secret_rejected', expect.anything())
    }
  })

  it("skips the action and hostname checks for Cloudflare's test secrets", async () => {
    expect(await register(TEST_KEYS, newName(), 'test')).toMatchObject({ status: 201 })
    expect(await register(TEST_KEYS, newName(), 'no')).toMatchObject({ status: 403 })
  })
})

describe('sign-in', () => {
  async function userWithOldHash() {
    const username = newName()
    expect(await register(KEYS, username, `ok:register:${HOST}`)).toMatchObject({ status: 201 })
    await db
      .update(users)
      .set({ passwordHash: hashPassword(PASSWORD, env.PASSWORD_PEPPER, { m: 1024, t: 1, p: 1 }) })
      .where(eq(users.usernameKey, username))
    return username
  }

  it('is checked before the password: a refused token never reaches Argon2', async () => {
    const username = await userWithOldHash()
    expect(await login(KEYS, username)).toEqual({
      status: 400,
      code: 'human_check_required',
      message: 'Reload the page to sign in',
    })
    expect(await login(KEYS, username, 'no')).toMatchObject({ status: 403 })
    expect(await login(KEYS, username, `ok:register:${HOST}`)).toMatchObject({ status: 403 })
    // A correct password checked by Argon2 would have upgraded the old hash.
    expect((await userNamed(username))!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=1024,/)

    expect(await login(KEYS, username, `ok:login:${HOST}`)).toMatchObject({ status: 200 })
    expect((await userNamed(username))!.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,/)
  })

  it("lets token-less tries use none of the name's limit", async () => {
    const username = await userWithOldHash()
    // More than the per-name limit (20 a minute), each from its own address.
    for (let i = 0; i < 25; i++) {
      expect(await login(KEYS, username, undefined, 'a wrong password')).toMatchObject({
        status: 400,
      })
    }
    expect(await login(KEYS, username, `ok:login:${HOST}`)).toMatchObject({ status: 200 })
  })

  it('goes on while siteverify cannot answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const username = newName()
    expect(await register(OFF, username)).toMatchObject({ status: 201 })
    for (const token of ['down', 'internal', 'throw', 'secret']) {
      expect(await login(KEYS, username, token)).toMatchObject({ status: 200 })
    }
    expect(warn).toHaveBeenCalledWith('turnstile_unavailable', expect.any(String))
    // Still only a check, not a pass: the password must be right.
    expect(await login(KEYS, username, 'down', 'a wrong password')).toMatchObject({ status: 401 })
  })
})

describe('Discord / Google', () => {
  const identity = (): PendingIdentity => ({
    provider: 'discord',
    sub: `${Date.now()}${++counter}`,
    email: null,
    emailVerified: false,
    displayName: 'Traveler',
    avatarUrl: null,
    handle: 'traveler',
  })

  async function pendingClient() {
    const client = new Client(withEnv({ ...KEYS, ...DISCORD }))
    client.setCookie(
      PENDING_COOKIE,
      await seal(env, 'oauth_pending', identity(), PENDING_TTL_S),
      '/api/auth/oauth',
    )
    return client
  }

  it('a new account through a provider takes the check', async () => {
    const client = await pendingClient()
    const path = '/api/auth/oauth/pending/register'
    const username = newName()
    expect(await call(client, path, { username })).toMatchObject({
      status: 400,
      code: 'human_check_required',
    })
    expect(await call(client, path, { username, turnstile: `ok:login:${HOST}` })).toMatchObject({
      status: 403,
    })
    expect(await userNamed(username)).toBeUndefined()
    expect(await call(client, path, { username, turnstile: `ok:register:${HOST}` })).toMatchObject({
      status: 201,
    })
  })

  it('signing in to link one is a sign-in: it takes the check too', async () => {
    const username = newName()
    expect(await register(OFF, username)).toMatchObject({ status: 201 })
    const client = await pendingClient()
    const path = '/api/auth/oauth/pending/login'
    expect(await call(client, path, { login: username, password: PASSWORD })).toMatchObject({
      status: 400,
      code: 'human_check_required',
    })
    expect(
      await call(client, path, {
        login: username,
        password: PASSWORD,
        turnstile: `ok:login:${HOST}`,
      }),
    ).toMatchObject({ status: 200 })
  })

  it('starting a sign-in or a link needs none', async () => {
    const username = newName()
    const client = new Client(withEnv({ ...KEYS, ...DISCORD }))
    const me = await client.json<MeResponse>('/api/auth/register', {
      method: 'POST',
      json: { username, password: PASSWORD, turnstile: `ok:register:${HOST}` },
    })
    expect(me.username).toBe(username)
    const before = siteverify.requests.length
    const link = await client.json<OAuthStartResponse>('/api/auth/oauth/discord/link', {
      method: 'POST',
    })
    expect(link.url).toMatch(/^https:\/\/discord\.com\//)
    const start = await new Client(withEnv({ ...KEYS, ...DISCORD })).json<OAuthStartResponse>(
      '/api/auth/oauth/discord/start',
      { method: 'POST', json: {} },
    )
    expect(start.url).toMatch(/^https:\/\/discord\.com\//)
    expect(siteverify.requests.length).toBe(before)
  })
})
