/**
 * Sign in with Discord / Google: the OAuth 2.0 authorization code flow with
 * PKCE (S256) and `state`. Google's is OpenID Connect, so it also carries a
 * `nonce` and answers with an ID token.
 *
 * - A provider is on only while the Worker has both its secrets
 *   (DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET, GOOGLE_CLIENT_ID +
 *   GOOGLE_CLIENT_SECRET). With none set nothing changes anywhere: the
 *   providers list is empty and the app shows no buttons.
 * - The redirect URI is fixed: this site's origin as `linkOrigin` decides it
 *   (SITE_URL or production, or loopback under `vite dev`), never the raw Host.
 * - `state`, the PKCE verifier, the nonce and what the round trip is for
 *   (sign in, or link to user N in session S at version V) travel in one cookie,
 *   `gdt_oauth`: an HS256 JWT under a key derived from JWT_SECRET (so it can
 *   never pass for a session token, nor one for it), HttpOnly, Secure,
 *   SameSite Lax (the provider's redirect back is a cross-site navigation),
 *   path /api/auth/oauth, valid 10 minutes.
 * - The code is exchanged here, server to server, with the client secret and
 *   the verifier. Discord's user comes from its users/@me endpoint. Google's
 *   from the ID token in the token response: it arrived straight from
 *   Google's token endpoint over TLS, which OpenID Connect Core 3.1.3.7 allows
 *   in place of checking its signature; issuer, audience, expiry and nonce are
 *   still checked.
 * - A provider account no user has linked yet is held in `gdt_oauth_pending`
 *   (same key, SameSite Strict, 15 minutes) for the "create an account / sign
 *   in to link" page. It is never put in a URL.
 *
 * Codes, tokens and emails are never logged.
 */

import { OAUTH_PROVIDERS, emailSchema, type OAuthProvider } from '@gdt/shared'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { decode, sign, verify } from 'hono/jwt'
import type { AppEnv } from '../env'
import { randomToken, safeEqual } from './crypto'
import { linkOrigin } from './email'
import { ApiError } from './http'

/** Optional parts of the environment (secrets, so not in wrangler.jsonc or `Env`). */
interface OAuthEnv {
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  /**
   * `vite dev` only (vite.config.ts sets it): both providers are the fake one
   * in dev/oauth-mock.ts on this same server. Honoured only on a loopback
   * origin, so it can't do anything on the real site even if set there.
   */
  OAUTH_DEV_MOCK?: string
}

interface Endpoints {
  authorize: string
  token: string
  /** Discord: who the access token belongs to. Google answers with an ID token instead. */
  user?: string
}

const ENDPOINTS: Record<OAuthProvider, Endpoints> = {
  discord: {
    authorize: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    user: 'https://discord.com/api/v10/users/@me',
  },
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
  },
}

const SCOPES: Record<OAuthProvider, string> = {
  discord: 'identify email',
  google: 'openid email profile',
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export const MOCK_PATH = '/__oauth-mock'

export interface ProviderConfig {
  provider: OAuthProvider
  clientId: string
  clientSecret: string
  endpoints: Endpoints
  /** The callback URL registered with the provider. */
  redirectUri: string
}

const LOOPBACK_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

const secretOf = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

/** The provider's settings for a request to this site, or null while it is off. */
export function providerConfig(
  env: Env,
  requestUrl: string,
  provider: OAuthProvider,
): ProviderConfig | null {
  const vars = env as unknown as OAuthEnv
  const origin = linkOrigin(env, requestUrl)
  const redirectUri = `${origin}/api/auth/oauth/${provider}/callback`
  if (vars.OAUTH_DEV_MOCK === '1' && LOOPBACK_ORIGIN.test(origin)) {
    const base = `${origin}${MOCK_PATH}/${provider}`
    return {
      provider,
      clientId: 'dev-mock',
      clientSecret: 'dev-mock',
      endpoints: {
        authorize: `${base}/authorize`,
        token: `${base}/token`,
        user: provider === 'discord' ? `${base}/user` : undefined,
      },
      redirectUri,
    }
  }
  const [id, secret] =
    provider === 'discord'
      ? [vars.DISCORD_CLIENT_ID, vars.DISCORD_CLIENT_SECRET]
      : [vars.GOOGLE_CLIENT_ID, vars.GOOGLE_CLIENT_SECRET]
  const clientId = secretOf(id)
  const clientSecret = secretOf(secret)
  if (!clientId || !clientSecret) return null
  return { provider, clientId, clientSecret, endpoints: ENDPOINTS[provider], redirectUri }
}

export function enabledProviders(env: Env, requestUrl: string): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => providerConfig(env, requestUrl, provider) !== null)
}

export function isProvider(value: string | undefined): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value ?? '')
}

// ------------------------------------------------------------------ cookies

export const STATE_COOKIE = 'gdt_oauth'
export const PENDING_COOKIE = 'gdt_oauth_pending'
const COOKIE_PATH = '/api/auth/oauth'
/** A round trip at the provider must finish within this. */
export const STATE_TTL_S = 10 * 60
/**
 * The state cookie outlives its token, so a late return reads "expired"
 * rather than "no state".
 */
const STATE_COOKIE_MAX_AGE_S = 60 * 60
export const PENDING_TTL_S = 15 * 60

const encoder = new TextEncoder()

/** The key the OAuth cookies are signed with: derived from JWT_SECRET, never equal to it. */
async function cookieKey(env: Env): Promise<string> {
  const secret = env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new ApiError(500, 'misconfigured', 'Server is missing JWT_SECRET')
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode('gdt oauth v1')))
  return Array.from(mac, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** What a round trip to the provider is for, held in the state cookie. */
export interface OAuthFlow {
  provider: OAuthProvider
  state: string
  verifier: string
  /** Google only. */
  nonce?: string
  intent: 'signin' | 'link'
  /** Linking: the user who started it, their session's token version and session row. */
  uid?: number
  ver?: number
  sid?: number
  /** Signing in: where to land. */
  next?: string
  redirectUri: string
}

/** The provider account a callback found no user for. */
export interface PendingIdentity {
  provider: OAuthProvider
  sub: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
  avatarUrl: string | null
  /** The provider's handle (Discord username, Google email name), for a username suggestion. */
  handle: string | null
}

type Sealed<T> = { ok: true; value: T } | { ok: false; error: 'state' | 'expired' }

/** Signs `value` as a JWT of type `typ`, expiring `ttlS` after `now` (ms). */
export async function seal(
  env: Env,
  typ: string,
  value: object,
  ttlS: number,
  now = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000)
  return sign({ ...value, typ, iat, exp: iat + ttlS }, await cookieKey(env), 'HS256')
}

async function unseal<T>(env: Env, typ: string, token: string | undefined): Promise<Sealed<T>> {
  if (!token) return { ok: false, error: 'state' }
  let payload: Record<string, unknown>
  try {
    // Expiry is checked below, so an expired token can be told from a forged one.
    payload = await verify(token, await cookieKey(env), { alg: 'HS256', exp: false, iat: false })
  } catch {
    return { ok: false, error: 'state' }
  }
  if (payload.typ !== typ) return { ok: false, error: 'state' }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    return { ok: false, error: 'expired' }
  }
  const { typ: _typ, iat: _iat, exp: _exp, ...value } = payload
  return { ok: true, value: value as T }
}

const cookieOptions = (sameSite: 'Lax' | 'Strict', maxAge: number) =>
  ({ path: COOKIE_PATH, httpOnly: true, secure: true, sameSite, maxAge }) as const

export async function setFlowCookie(c: Context<AppEnv>, flow: OAuthFlow): Promise<void> {
  const token = await seal(c.env, 'oauth_state', flow, STATE_TTL_S)
  setCookie(c, STATE_COOKIE, token, cookieOptions('Lax', STATE_COOKIE_MAX_AGE_S))
}

/** The flow this browser started, and the cookie is cleared: a state works once. */
export async function takeFlowCookie(c: Context<AppEnv>): Promise<Sealed<OAuthFlow>> {
  const token = getCookie(c, STATE_COOKIE)
  if (token) deleteCookie(c, STATE_COOKIE, { path: COOKIE_PATH, secure: true })
  return unseal<OAuthFlow>(c.env, 'oauth_state', token)
}

export async function setPendingCookie(
  c: Context<AppEnv>,
  identity: PendingIdentity,
): Promise<void> {
  const token = await seal(c.env, 'oauth_pending', identity, PENDING_TTL_S)
  setCookie(c, PENDING_COOKIE, token, cookieOptions('Strict', PENDING_TTL_S))
}

export async function readPendingCookie(c: Context<AppEnv>): Promise<PendingIdentity | null> {
  const sealed = await unseal<PendingIdentity>(c.env, 'oauth_pending', getCookie(c, PENDING_COOKIE))
  return sealed.ok && isProvider(sealed.value.provider) ? sealed.value : null
}

export function clearPendingCookie(c: Context<AppEnv>): void {
  deleteCookie(c, PENDING_COOKIE, { path: COOKIE_PATH, secure: true })
}

// --------------------------------------------------------------------- flow

async function s256(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fresh flow: random state, verifier (43 characters) and, for Google, nonce. */
export function newFlow(
  config: ProviderConfig,
  intent: Pick<OAuthFlow, 'intent' | 'uid' | 'ver' | 'sid' | 'next'>,
): OAuthFlow {
  return {
    provider: config.provider,
    state: randomToken(24),
    verifier: randomToken(32),
    ...(config.provider === 'google' ? { nonce: randomToken(24) } : {}),
    ...intent,
    redirectUri: config.redirectUri,
  }
}

/** Where to send the browser to sign in at the provider. */
export async function authorizationUrl(config: ProviderConfig, flow: OAuthFlow): Promise<string> {
  const url = new URL(config.endpoints.authorize)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', flow.redirectUri)
  url.searchParams.set('scope', SCOPES[config.provider])
  url.searchParams.set('state', flow.state)
  url.searchParams.set('code_challenge', await s256(flow.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  if (flow.nonce) url.searchParams.set('nonce', flow.nonce)
  if (config.provider === 'google') url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

/** The callback's `state` is the one this browser's cookie holds (constant time). */
export function stateMatches(flow: OAuthFlow, state: string | undefined): boolean {
  return typeof state === 'string' && state.length > 0 && safeEqual(state, flow.state)
}

/** A provider answer this app refuses; `step` is for the log (never the answer itself). */
export class OAuthFailure extends Error {
  constructor(readonly step: string) {
    super(`oauth ${step}`)
    this.name = 'OAuthFailure'
  }
}

const TIMEOUT_MS = 10_000

async function postForm(
  url: string,
  form: URLSearchParams,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...headers,
    },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new OAuthFailure(`token ${response.status}`)
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') throw new OAuthFailure('token body')
  return body
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null

function emailOf(value: unknown): string | null {
  const parsed = emailSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

/** Exchanges the code (with the verifier) and reads who signed in. */
export async function fetchIdentity(
  config: ProviderConfig,
  code: string,
  flow: OAuthFlow,
): Promise<PendingIdentity> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: flow.redirectUri,
    code_verifier: flow.verifier,
  })
  return config.provider === 'discord'
    ? discordIdentity(config, form)
    : googleIdentity(config, form, flow)
}

async function discordIdentity(
  config: ProviderConfig,
  form: URLSearchParams,
): Promise<PendingIdentity> {
  const basic = btoa(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
  )
  const token = await postForm(config.endpoints.token, form, { authorization: `Basic ${basic}` })
  if (typeof token.access_token !== 'string') throw new OAuthFailure('token missing')
  const response = await fetch(config.endpoints.user!, {
    headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new OAuthFailure(`user ${response.status}`)
  const user = (await response.json().catch(() => null)) as Record<string, unknown> | null
  const id = user?.id
  if (typeof id !== 'string' || !/^\d{1,32}$/.test(id)) throw new OAuthFailure('user id')
  const avatar =
    typeof user!.avatar === 'string' && /^\w+$/.test(user!.avatar) ? user!.avatar : null
  const email = emailOf(user!.email)
  return {
    provider: 'discord',
    sub: id,
    email,
    // Discord's `verified`: the email on the Discord account was confirmed.
    emailVerified: email !== null && user!.verified === true,
    displayName: text(user!.global_name, 100) ?? text(user!.username, 100),
    avatarUrl: avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=64` : null,
    handle: text(user!.username, 64),
  }
}

async function googleIdentity(
  config: ProviderConfig,
  form: URLSearchParams,
  flow: OAuthFlow,
): Promise<PendingIdentity> {
  form.set('client_id', config.clientId)
  form.set('client_secret', config.clientSecret)
  const token = await postForm(config.endpoints.token, form, {})
  if (typeof token.id_token !== 'string') throw new OAuthFailure('id_token missing')
  let claims: Record<string, unknown>
  try {
    claims = decode(token.id_token).payload
  } catch {
    throw new OAuthFailure('id_token malformed')
  }
  if (!GOOGLE_ISSUERS.includes(String(claims.iss))) throw new OAuthFailure('id_token iss')
  const aud = claims.aud
  if (!(aud === config.clientId || (Array.isArray(aud) && aud.includes(config.clientId)))) {
    throw new OAuthFailure('id_token aud')
  }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) {
    throw new OAuthFailure('id_token exp')
  }
  if (!flow.nonce || typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, flow.nonce)) {
    throw new OAuthFailure('id_token nonce')
  }
  const sub = claims.sub
  if (typeof sub !== 'string' || !/^[\w-]{1,255}$/.test(sub)) throw new OAuthFailure('id_token sub')
  const email = emailOf(claims.email)
  return {
    provider: 'google',
    sub,
    email,
    emailVerified:
      email !== null && (claims.email_verified === true || claims.email_verified === 'true'),
    displayName: text(claims.name, 100),
    avatarUrl: httpsUrl(claims.picture),
    handle: email ? email.split('@')[0]! : text(claims.name, 64),
  }
}
