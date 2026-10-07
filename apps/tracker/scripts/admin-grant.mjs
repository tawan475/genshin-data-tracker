// Gives a user a staff role, or takes it away. The only way to give the
// Owner role (every permission, now and later): the dashboard can't, so a
// stolen staff session can never make an Owner.
//
//   pnpm --filter @gdt/tracker admin:grant <username|email> <role> [--revoke] [--local]
//
// <role> is a role's name (Owner, Admin, Moderator, Support, or one made in
// the dashboard), any case. Runs `wrangler d1 execute` on the remote database
// (`--local`: the dev database). The last Owner can't be revoked. Roles take
// effect on the user's next request; nothing is written to the audit log
// (that records the dashboard).

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const local = args.includes('--local')
const revoke = args.includes('--revoke')
const [rawLogin, ...roleWords] = args.filter((arg) => !arg.startsWith('--'))
const login = rawLogin?.trim().toLowerCase()
const roleName = roleWords.join(' ').trim()

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!login || !roleName) {
  fail(
    'Usage: pnpm --filter @gdt/tracker admin:grant <username|email> <role> [--revoke] [--local]',
  )
}
// Usernames are [a-z0-9_.-]; emails add "@" and a few more; role names are
// short words. Nothing here can end a SQL string.
if (!/^[a-z0-9_.+@-]+$/.test(login)) fail(`Not a username or email: ${login}`)
if (!/^[A-Za-z0-9 _.+-]{1,32}$/.test(roleName)) fail(`Not a role name: ${roleName}`)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = join(
  dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin',
  'wrangler.js',
)
const where = local ? 'local' : 'remote'

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
  `SELECT id, username FROM users WHERE username_key = '${login}' OR email = '${login}' LIMIT 2`,
)
if (users.length !== 1) fail(`No user "${login}" in the ${where} database.`)
const [user] = users
if (!Number.isSafeInteger(user.id)) fail('Unexpected answer from D1.')

const roles = d1(
  `SELECT id, name, built_in FROM roles WHERE lower(name) = lower('${roleName}') ORDER BY position DESC`,
)
if (roles.length === 0) {
  const names = d1('SELECT name FROM roles ORDER BY position DESC').map((r) => r.name)
  fail(`No role "${roleName}" in the ${where} database. Roles: ${names.join(', ') || 'none'}.`)
}
if (roles.length > 1) fail(`More than one role is named "${roleName}": rename one first.`)
const [role] = roles

if (revoke) {
  if (role.built_in === 1) {
    const [{ others }] = d1(
      `SELECT count(*) AS others FROM user_roles WHERE role_id = ${role.id} AND user_id <> ${user.id}`,
    )
    if (others === 0) fail(`${user.username} is the last ${role.name}: give it to someone else first.`)
  }
  d1(`DELETE FROM user_roles WHERE user_id = ${user.id} AND role_id = ${role.id}`)
  console.log(`${user.username} (id ${user.id}) no longer has ${role.name} (${where}).`)
} else {
  d1(
    `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
     VALUES (${user.id}, ${role.id}, NULL, ${Date.now()}) ON CONFLICT DO NOTHING`,
  )
  console.log(`${user.username} (id ${user.id}) has ${role.name} (${where}).`)
}
