/**
 * `vite dev` only: a fake Discord and Google at /__oauth-mock, so "Continue
 * with Discord / Google" works locally without real apps or secrets.
 * vite.config.ts sets OAUTH_DEV_MOCK=1 for the dev Worker, which then sends
 * the browser here instead of to the provider (worker/lib/oauth.ts; only on a
 * loopback origin). Builds never include this file.
 *
 * It plays the provider's side of the code flow like the real ones: an
 * approve page (pick the account), single-use codes bound to the redirect URI
 * and the PKCE challenge, a token endpoint that checks the verifier, Discord's
 * users/@me and Google's ID token (unsigned: the Worker reads it as received
 * from the token endpoint). Put `OAUTH_DEV_MOCK=0` in .dev.vars to use the real
 * providers locally (with their secrets there too).
 */

import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

export const MOCK_PATH = '/__oauth-mock'

type Provider = 'discord' | 'google'

interface MockAccount {
  id: string
  name: string
  email: string
  verified: boolean
}

interface Grant {
  provider: Provider
  account: MockAccount
  clientId: string
  redirectUri: string
  challenge: string
  nonce: string | null
  expires: number
}

const codes = new Map<string, Grant>()
const tokens = new Map<string, Grant>()

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')
const random = (bytes = 24) => randomBytes(bytes).toString('base64url')

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  )

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.statusCode = status
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

const json = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, 'application/json', JSON.stringify(body))

function redirect(res: ServerResponse, url: string) {
  res.statusCode = 302
  res.setHeader('location', url)
  res.end()
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

/** The redirect URI must be this dev server's own callback for the provider. */
function trustedRedirect(req: IncomingMessage, provider: Provider, uri: string | null) {
  if (!uri) return false
  const host = req.headers.host ?? ''
  return uri === `http://${host}/api/auth/oauth/${provider}/callback`
}

function approvePage(provider: Provider, params: URLSearchParams): string {
  const label = provider === 'discord' ? 'Discord' : 'Google'
  const id =
    provider === 'discord'
      ? String(100_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e15)))
      : String(100_000_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e15)))
  const hidden = [...params]
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
    .join('')
  const field = (name: string, value: string, label: string) =>
    `<label>${label}<input name="${name}" value="${escape(value)}" autocomplete="off"></label>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock ${label}</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e2e8f0;font:15px system-ui,sans-serif}
form{width:min(360px,calc(100vw - 32px));background:#111827;border:1px solid #334155;border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:12px}
h1{margin:0 0 4px;font-size:18px}p{margin:0;color:#94a3b8;font-size:13px}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#94a3b8}
input:not([type=checkbox]){padding:8px 10px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#fff;font:inherit}
.row{flex-direction:row;align-items:center;gap:8px}.btns{display:flex;flex-direction:row-reverse;gap:8px;margin-top:4px}
button{flex:1;padding:10px;border-radius:8px;border:0;font:inherit;font-weight:600;cursor:pointer}
.ok{background:#4f46e5;color:#fff}.no{background:#1e293b;color:#cbd5e1}
</style></head><body><form method="get" action="approve">
<h1>Mock ${label}</h1><p>Dev server only. Pick who signs in.</p>${hidden}
${field('mock_id', id, `${label} user id`)}
${field('mock_name', 'mock-traveler', 'Name')}
${field('mock_email', 'mock.traveler@example.com', 'Email')}
<label class="row"><input type="checkbox" name="mock_verified" value="1" checked>Email verified</label>
<div class="btns"><button class="ok" type="submit" name="approve" value="1">Continue</button><button class="no" name="deny" value="1">Cancel</button></div>
</form></body></html>`
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://mock')
  const [, provider, step] = url.pathname.split('/') as [string, Provider, string]
  if (provider !== 'discord' && provider !== 'google') return json(res, 404, { error: 'not_found' })

  if (step === 'authorize' && req.method === 'GET') {
    const q = url.searchParams
    if (
      q.get('response_type') !== 'code' ||
      q.get('code_challenge_method') !== 'S256' ||
      !q.get('code_challenge') ||
      !q.get('state') ||
      !trustedRedirect(req, provider, q.get('redirect_uri'))
    ) {
      return send(res, 400, 'text/plain', 'invalid_request')
    }
    return send(res, 200, 'text/html; charset=utf-8', approvePage(provider, q))
  }

  if (step === 'approve' && req.method === 'GET') {
    const q = url.searchParams
    const redirectUri = q.get('redirect_uri')
    if (!trustedRedirect(req, provider, redirectUri)) {
      return send(res, 400, 'text/plain', 'invalid_request')
    }
    const back = new URL(redirectUri!)
    back.searchParams.set('state', q.get('state') ?? '')
    if (q.get('deny')) {
      back.searchParams.set('error', 'access_denied')
      return redirect(res, back.toString())
    }
    const code = random()
    codes.set(code, {
      provider,
      account: {
        id: q.get('mock_id') ?? '1',
        name: q.get('mock_name') ?? 'mock',
        email: q.get('mock_email') ?? '',
        verified: q.get('mock_verified') === '1',
      },
      clientId: q.get('client_id') ?? '',
      redirectUri: redirectUri!,
      challenge: q.get('code_challenge') ?? '',
      nonce: q.get('nonce'),
      expires: Date.now() + 60_000,
    })
    back.searchParams.set('code', code)
    return redirect(res, back.toString())
  }

  if (step === 'token' && req.method === 'POST') {
    const form = await readForm(req)
    const code = form.get('code') ?? ''
    const grant = codes.get(code)
    codes.delete(code) // single use, like the real ones
    const verifier = form.get('code_verifier') ?? ''
    if (
      !grant ||
      grant.provider !== provider ||
      grant.expires < Date.now() ||
      form.get('grant_type') !== 'authorization_code' ||
      form.get('redirect_uri') !== grant.redirectUri ||
      b64url(createHash('sha256').update(verifier).digest()) !== grant.challenge
    ) {
      return json(res, 400, { error: 'invalid_grant' })
    }
    const accessToken = random()
    tokens.set(accessToken, grant)
    if (provider === 'discord') {
      return json(res, 200, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 604_800,
        scope: 'identify email',
      })
    }
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      iss: 'https://accounts.google.com',
      aud: grant.clientId,
      sub: grant.account.id,
      email: grant.account.email || undefined,
      email_verified: grant.account.verified,
      name: grant.account.name,
      nonce: grant.nonce,
      iat: now,
      exp: now + 3600,
    }
    const idToken = `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify(claims))}.mock`
    return json(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3599,
      scope: 'openid email profile',
      id_token: idToken,
    })
  }

  if (step === 'user' && provider === 'discord' && req.method === 'GET') {
    const grant = tokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    if (!grant) return json(res, 401, { message: '401: Unauthorized', code: 0 })
    const handle = grant.account.name.toLowerCase().replace(/[^a-z0-9_.]/g, '') || 'mock'
    return json(res, 200, {
      id: grant.account.id,
      username: handle,
      global_name: grant.account.name,
      avatar: null,
      email: grant.account.email || null,
      verified: grant.account.verified,
    })
  }

  return json(res, 404, { error: 'not_found' })
}

export function oauthMock(): Plugin {
  return {
    name: 'gdt-oauth-mock',
    apply: 'serve',
    configureServer(server) {
      // First in the stack: the Cloudflare plugin's middleware would otherwise
      // answer every path (the SPA fallback) before this one sees it.
      server.middlewares.stack.unshift({
        route: MOCK_PATH,
        handle: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
          handle(req, res).catch(next)
        },
      })
    },
  }
}
