import type { Router } from 'vue-router'

/**
 * The app's router for code outside components (no `useRouter()` there).
 * Kept apart from router/index.ts on purpose: that module lists every page's
 * lazy import, so whatever imports it is renamed whenever any page changes
 * (see vite.config.ts `startupGraph`).
 */
let current: Router | null = null

export function setAppRouter(router: Router): void {
  current = router
}

export function appRouter(): Router | null {
  return current
}
