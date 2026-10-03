import { Hono } from 'hono'
import type { AppEnv } from './env'
import { ApiError, errorBody } from './lib/http'
import { accounts } from './routes/accounts'
import { auth } from './routes/auth'
import { health } from './routes/health'
import { me } from './routes/me'
import { publicImport } from './routes/public'

const app = new Hono<AppEnv>().basePath('/api')

app.route('/health', health)
app.route('/auth', auth)
app.route('/me', me)
app.route('/accounts', accounts)
app.route('/genshin-accounts-public', publicImport)

app.notFound((c) => c.json(errorBody(new ApiError(404, 'not_found', 'Not found')), 404))

app.onError((error, c) => {
  if (error instanceof ApiError) return c.json(errorBody(error), error.status)
  console.error(error)
  return c.json(errorBody(new ApiError(500, 'internal', 'Something went wrong')), 500)
})

export default app
