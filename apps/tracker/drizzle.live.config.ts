import { defineConfig } from 'drizzle-kit'

// The `gdt-live` database (binding LIVE_DB): its own schema and migrations
// (`pnpm db:generate:live`; applied by `pnpm db:migrate:live:local|remote`).
export default defineConfig({
  dialect: 'sqlite',
  schema: './worker/db/live-schema.ts',
  out: './migrations-live',
})
