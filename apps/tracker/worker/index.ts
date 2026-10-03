import { Hono } from 'hono'

export type AppEnv = { Bindings: Env }

const app = new Hono<AppEnv>().basePath('/api')

app.get('/health', async (c) => {
  await c.env.DB.prepare('select 1').first()
  return c.json({ ok: true })
})

app.notFound((c) => c.json({ status: 404, message: 'Not found' }, 404))

export default app
