// Makes a one-time password reset link for a user, for an admin to hand over
// privately (e.g. on Discord). The admin never sees or sets the password: the
// user opens the link and picks one. Works for users without an email.
//
//   pnpm --filter @gdt/tracker admin:reset-link <username|email> [--local] [--site <origin>]
//
// The token is 32 random bytes; only its SHA-256 goes into D1 (`auth_tokens`,
// kind reset_password, no email, valid 24 hours), through `wrangler d1
// execute` on the remote database (`--local`: the dev database): the same row
// the staff dashboard's "Reset link" writes (adminResetLink in
// worker/services/auth-tokens.ts). Using it signs every device out and ends
// the user's other reset links.

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VALID_MS = 24 * 60 * 60 * 1000
const PROD_SITE = 'https://genshin-tracker.475.dev'
const DEV_SITE = 'http://localhost:5173'

const args = process.argv.slice(2)
const local = args.includes('--local')
const siteAt = args.indexOf('--site')
const site = siteAt >= 0 ? args[siteAt + 1] : local ? DEV_SITE : PROD_SITE
const login = args
  .filter((arg, i) => !arg.startsWith('--') && (siteAt < 0 || i !== siteAt + 1))
  .at(0)
  ?.trim()
  .toLowerCase()

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!login || !site) {
  fail(
    'Usage: pnpm --filter @gdt/tracker admin:reset-link <username|email> [--local] [--site <origin>]',
  )
}
// Usernames are [a-z0-9_.-]; emails add "@" and a few more. Nothing here can end a SQL string.
if (!/^[a-z0-9_.+@-]+$/.test(login)) fail(`Not a username or email: ${login}`)
let origin
try {
  origin = new URL(site).origin
} catch {
  fail(`Not a URL: ${site}`)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = join(
  dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin',
  'wrangler.js',
)

/** Runs one SQL statement on D1 and returns its rows. */
function d1(sql) {
  const out = execFileSync(
    process.execPath,
    [wrangler, 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--json', '--command', sql],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const json = out.slice(out.indexOf('['))
  return JSON.parse(json)[0]?.results ?? []
}

const users = d1(
  `SELECT id, username, email, email_verified FROM users WHERE username_key = '${login}' OR email = '${login}' LIMIT 2`,
)
if (users.length !== 1) fail(`No user "${login}" in the ${local ? 'local' : 'remote'} database.`)
const [user] = users
if (!Number.isSafeInteger(user.id)) fail('Unexpected answer from D1.')

const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const now = Date.now()
const expires = now + VALID_MS
d1(
  `INSERT INTO auth_tokens (user_id, kind, token_hash, email, expires_at, created_at) VALUES (${user.id}, 'reset_password', '${hash}', NULL, ${expires}, ${now})`,
)

console.log(`
Reset link for ${user.username} (id ${user.id}${user.email ? `, ${user.email}` : ', no email'}).
Works once, until ${new Date(expires).toLocaleString()}. Send it privately:

${origin}/reset-password?token=${token}
`)
