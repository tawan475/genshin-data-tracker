import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from './env'
import { ApiError, errorBody } from './lib/http'
import { accounts } from './routes/accounts'
import { admin } from './routes/admin'
import { auth } from './routes/auth'
import { health } from './routes/health'
import { live } from './routes/live'
import { me } from './routes/me'
import { oauth } from './routes/oauth'
import { progress } from './routes/progress'
import { publicImport } from './routes/public'
import { recovery } from './routes/recovery'
import { staff } from './routes/staff'
import { runMaintenance } from './services/maintenance'

const app = new Hono<AppEnv>().basePath('/api')

// API responses are JSON or downloads, never pages: lock them down.
app.use(secureHeaders({ crossOriginResourcePolicy: 'same-origin', xFrameOptions: 'DENY' }))

// A response that sets a session cookie must never be stored by any cache.
app.use(async (c, next) => {
  await next()
  if (c.res.headers.has('set-cookie')) c.res.headers.set('Cache-Control', 'private, no-store')
})

app.route('/health', health)
app.route('/auth', auth)
app.route('/auth', recovery)
app.route('/auth/oauth', oauth)
app.route('/me', me)
app.route('/accounts', accounts)
app.route('/accounts', progress)
app.route('/genshin-accounts-public', publicImport)
app.route('/live', live)
app.route('/admin', admin)
app.route('/staff', staff)

app.notFound((c) => c.json(errorBody(new ApiError(404, 'not_found', 'Not found')), 404))

app.onError((error, c) => {
  if (error instanceof ApiError) return c.json(errorBody(error), error.status, error.headers)
  console.error(error)
  return c.json(errorBody(new ApiError(500, 'internal', 'Something went wrong')), 500)
})

export { LiveHub } from './services/live'

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    // Optional var (wrangler.jsonc "vars" or the dashboard): v1 rows to repack per day.
    const repackLimit = Number((env as { REPACK_CRON_LIMIT?: string }).REPACK_CRON_LIMIT ?? 0) || 0
    ctx.waitUntil(
      runMaintenance(env.DB, Date.now(), { repackLimit }).then((result) =>
        console.log('maintenance', JSON.stringify(result)),
      ),
    )
  },
} satisfies ExportedHandler<Env>
