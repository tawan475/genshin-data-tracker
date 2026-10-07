import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { cloudflare, type PluginConfig } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

import { GI_CDN_HOST, IMAGE_HOST } from '@gdt/game-data/image-url'
import { oauthMock } from './dev/oauth-mock.ts'
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

/** Where game images load from, as the game data says (src/lib/assets.ts uses the same). */
const imageHosts = [IMAGE_HOST, GI_CDN_HOST].map((url) => new URL(url).hostname)

/** index.html's preconnect to the image host. */
function imageHostPreconnect(): Plugin {
  return {
    name: 'image-host-preconnect',
    transformIndexHtml: (html) => html.replace('__IMAGE_ORIGIN__', new URL(IMAGE_HOST).origin),
  }
}

/**
 * Emits /sw.js from src/pwa/sw-template.js with this build's id, the list
 * of files to precache (the hashed JS/CSS plus the app shell and icons) and
 * the image hosts it keeps cache-first.
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
        .replace('__IMAGE_HOSTS__', JSON.stringify(imageHosts))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/**
 * `vite dev` only, so the account flows work locally. Builds never get these:
 * - a simulated `send_email` binding (Miniflare logs each mail and saves its
 *   text and HTML to a file; nothing is sent). The deployed Worker has EMAIL
 *   once wrangler.jsonc does (see there). Like production, the email features
 *   stay paused unless `.dev.vars` has `EMAIL_FEATURES=1`.
 * - OAUTH_DEV_MOCK: "Continue with Discord / Google" go to the fake provider
 *   in dev/oauth-mock.ts. `OAUTH_DEV_MOCK=0` in .dev.vars turns it off.
 * - The human check (worker/lib/turnstile.ts) with Cloudflare's always-pass
 *   test keys: the real widget, invisible, every token accepted. Keys in
 *   .dev.vars override them (site key 3x00000000000000000000FF forces an
 *   interactive challenge); empty ones turn the check off.
 */
const devWorker: PluginConfig = {
  config: (worker) => ({
    ...(worker.send_email?.length ? {} : { send_email: [{ name: 'EMAIL' }] }),
    vars: {
      ...worker.vars,
      OAUTH_DEV_MOCK: '1',
      TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    },
  }),
}

// https://vite.dev/config/
// The Cloudflare plugin runs worker/index.ts in workerd during `vite dev` and
// builds the SPA plus the Worker together for `wrangler deploy`.
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    // `vite dev` only: the fake Discord / Google at /__oauth-mock.
    oauthMock(),
    cloudflare(command === 'serve' ? devWorker : {}),
    imageHostPreconnect(),
    serviceWorker(),
  ],
  // Pre-bundle every client dependency up front. Discovering one at runtime
  // makes Vite re-optimise and invalidate loaded modules, which shows up as
  // "Failed to fetch dynamically imported module" in an open tab.
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      'lucide-vue-next',
      'zod',
      'fflate',
      'chart.js',
      'chartjs-plugin-zoom',
      'vue-chartjs',
      '@vueuse/core',
      'modern-screenshot',
    ],
    // The game data (a git dependency, built ESM) is served as is: pre-bundling
    // would merge its per-file JSON chunks, and its subpath modules would each
    // need an entry here.
    exclude: ['@gdt/game-data'],
  },
  // JSON imports are used whole; per-key named exports doubled the icon map's size.
  json: { namedExports: false },
  define: {
    __BUILD__: JSON.stringify(build),
    __MIGRATIONS__: JSON.stringify(migrations),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
