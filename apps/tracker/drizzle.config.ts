import { defineConfig } from 'drizzle-kit'

// Generates plain SQL migrations; wrangler applies them to D1
// (`pnpm db:migrate:local` / `pnpm db:migrate:remote`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/db/schema.ts',
  out: './migrations',
})
