import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
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

/**
 * Emits /sw.js from src/pwa/sw-template.js with this build's id and the list
 * of files to precache (the hashed JS/CSS plus the app shell and icons).
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      if (this.environment.name !== 'client') return
      const built = Object.keys(bundle)
        .filter((file) => /\.(js|css)$/.test(file))
        .map((file) => `/${file}`)
      const precache = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', ...built]
      const source = readFileSync(new URL('./src/pwa/sw-template.js', import.meta.url), 'utf8')
        .replace("'__BUILD__'", JSON.stringify(`${build.commit}-${Date.now().toString(36)}`))
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
// The Cloudflare plugin runs worker/index.ts in workerd during `vite dev` and
// builds the SPA plus the Worker together for `wrangler deploy`.
export default defineConfig({
  plugins: [vue(), vueDevTools(), tailwindcss(), cloudflare(), serviceWorker()],
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
