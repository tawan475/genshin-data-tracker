import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Worker tests run inside workerd against a local D1, with the real migrations
// applied before each test file (see worker/test/setup.ts).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL('./migrations', import.meta.url)))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            JWT_SECRET: 'test-jwt-secret-test-jwt-secret-0123456789',
            PASSWORD_PEPPER: 'test-pepper-test-pepper-test-pepper-0123',
            DIAG_KEY: 'test-diag-key-test-diag-key-test-diag-key',
          },
        },
      }),
    ],
    test: {
      include: ['worker/**/*.test.ts'],
      setupFiles: ['./worker/test/setup.ts'],
    },
  }
})
