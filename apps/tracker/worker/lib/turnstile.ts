/**
 * The human check (Cloudflare Turnstile) on sign-up and password sign-in.
 *
 * - On only while the Worker has both TURNSTILE_SITE_KEY and
 *   TURNSTILE_SECRET_KEY (secrets, so not in wrangler.jsonc or `Env`). Off,
 *   nothing is asked and `GET /api/auth/oauth/providers` answers
 *   `turnstileSiteKey: null`, so the app renders no widget.
 * - The page renders the widget (Managed, appearance interaction-only: most
 *   people never see it) with the action its form uses, and sends the token
 *   as `turnstile`. requireHuman checks it with siteverify (with the
 *   visitor's IP, 5 s timeout): `success`, the action, and this site's
 *   hostname. Cloudflare's test secrets answer neither action nor hostname,
 *   so those two checks are skipped for them.
 * - No token: 400 `human_check_required` (an app cached from before the
 *   widget shows the message). Refused: 403 `human_check_failed`.
 *   siteverify unreachable or failing on its side: a sign-up is refused (503
 *   `human_check_unavailable`), a sign-in goes on (logged): an outage at
 *   Cloudflare must not lock people out of their accounts, and the per-name
 *   limit and Argon2 still stand.
 * - Not on "Continue with Discord / Google" (the provider is the check; a new
 *   account through one is checked on /oauth), linking, or import keys.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { linkOrigin } from './email'
import { ApiError } from './http'

/** Optional parts of the environment (secrets, so not in wrangler.jsonc or `Env`). */
interface TurnstileEnv {
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
}

/** What a form asks the widget for, and siteverify must answer. */
export type HumanAction = 'login' | 'register'

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 5_000

/** Cloudflare's test secrets (always pass, always fail, already spent). */
const TEST_SECRET = /^[123]x0{31}AA$/

const keyOf = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Both keys, or null while the check is off. */
export function turnstileConfig(env: Env): { siteKey: string; secretKey: string } | null {
  const vars = env as unknown as TurnstileEnv
  const siteKey = keyOf(vars.TURNSTILE_SITE_KEY)
  const secretKey = keyOf(vars.TURNSTILE_SECRET_KEY)
  return siteKey && secretKey ? { siteKey, secretKey } : null
}

interface Siteverify {
  success?: unknown
  action?: unknown
  hostname?: unknown
  'error-codes'?: unknown
}

/**
 * Checks the human-check token a form sent for one of `actions`; throws the
 * answer above when it doesn't pass. Does nothing while the check is off. A
 * sign-up (`register` among the actions) is refused when siteverify can't
 * answer; a sign-in goes on.
 */
export async function requireHuman(
  c: Context<AppEnv>,
  token: string | undefined,
  actions: readonly HumanAction[],
): Promise<void> {
  const config = turnstileConfig(c.env)
  if (!config) return
  const signUp = actions.includes('register')
  if (!token) {
    throw new ApiError(
      400,
      'human_check_required',
      signUp ? 'Reload the page to sign up' : 'Reload the page to sign in',
    )
  }
  const unavailable = (why: string) => {
    if (signUp) {
      throw new ApiError(503, 'human_check_unavailable', 'Human check unavailable, try again soon')
    }
    console.warn('turnstile_unavailable', why)
  }

  let answer: Siteverify
  try {
    const ip = c.req.header('cf-connecting-ip')
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return unavailable(`status ${response.status}`)
    answer = ((await response.json().catch(() => null)) ?? {}) as Siteverify
  } catch (error) {
    return unavailable(error instanceof Error ? error.name : 'network')
  }

  const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'].map(String) : []
  if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
    // Every check would fail: the secret is wrong. Loud, and treated as an outage.
    console.error('turnstile_secret_rejected', codes.join(','))
    return unavailable('secret')
  }
  if (codes.includes('internal-error')) return unavailable('internal-error')
  const passed =
    answer.success === true &&
    (TEST_SECRET.test(config.secretKey) ||
      ((actions as readonly unknown[]).includes(answer.action) &&
        answer.hostname === new URL(linkOrigin(c.env, c.req.url)).hostname))
  if (!passed) throw new ApiError(403, 'human_check_failed', 'Human check failed, try again')
}
