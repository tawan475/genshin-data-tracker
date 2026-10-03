import { ref } from 'vue'

/** A new build is installed and waiting; the banner offers to switch to it. */
export const updateAvailable = ref(false)

/** Set when the browser offers installation (Chromium); used by Settings. */
export const installPrompt = ref<{ prompt: () => Promise<unknown> } | null>(null)

let waiting: ServiceWorker | null = null

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Production only: dev serves modules straight from Vite. */
export function registerServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt.value = event as unknown as { prompt: () => Promise<unknown> }
  })
  window.addEventListener('appinstalled', () => (installPrompt.value = null))

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const offer = (worker: ServiceWorker | null) => {
        if (worker && navigator.serviceWorker.controller) {
          waiting = worker
          updateAvailable.value = true
        }
      }
      offer(registration.waiting)
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed') offer(installing)
        })
      })
      // A long-lived tab (or an installed app) checks for a new build when it comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update()
      })
    } catch {
      // No service worker: the app still works, just without offline support.
    }
  })

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

/** Switches to the waiting build; the page reloads when it takes over. */
export function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING')
}
