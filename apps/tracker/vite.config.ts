import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

import pkg from './package.json' with { type: 'json' }

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// Baked into the bundle and reported by /api/health.
const build = {
  version: pkg.version,
  commit: git('rev-parse --short HEAD') || 'unknown',
  dirty: git('status --porcelain') !== '',
  builtAt: new Date().toISOString(),
}
const migrations = readdirSync(new URL('./migrations', import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .sort()

// https://vite.dev/config/
// The Cloudflare plugin runs worker/index.ts in workerd during `vite dev` and
// builds the SPA plus the Worker together for `wrangler deploy`.
export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss(), cloudflare()],
  define: {
    __BUILD__: JSON.stringify(build),
    __MIGRATIONS__: JSON.stringify(migrations),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
