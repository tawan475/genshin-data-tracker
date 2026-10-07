/**
 * Cloudflare Turnstile's script, loaded on first use (only the pages with a
 * human check need it, and only while the server has it on). Explicit
 * rendering: components/auth/HumanCheck.vue renders the widget. The service
 * worker leaves this host alone, and the site sets no CSP.
 */

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
/** Past this the script counts as blocked (an extension, a firewall, offline). */
const LOAD_TIMEOUT_MS = 15_000

/** The part of Turnstile's API the app uses. */
export interface TurnstileOptions {
  sitekey: string
  action?: string
  theme?: 'light' | 'dark' | 'auto'
  appearance?: 'always' | 'execute' | 'interaction-only'
  size?: 'normal' | 'flexible' | 'compact'
  'response-field'?: boolean
  'refresh-expired'?: 'auto' | 'manual' | 'never'
  retry?: 'auto' | 'never'
  callback?: (token: string) => void
  'error-callback'?: (code: string) => boolean | void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
  'before-interactive-callback'?: () => void
  'after-interactive-callback'?: () => void
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | null | undefined
  reset(widgetId?: string): void
  remove(widgetId?: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

/** The Turnstile API; rejects when the script can't be loaded (and a later call tries again). */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      clearTimeout(timer)
      script.remove()
      loading = null
      reject(new Error('Human check blocked. Allow challenges.cloudflare.com, then reload.'))
    }
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS)
    script.src = SCRIPT_URL
    script.async = true
    script.addEventListener('load', () => {
      clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    })
    script.addEventListener('error', fail)
    document.head.append(script)
  })
  return loading
}
