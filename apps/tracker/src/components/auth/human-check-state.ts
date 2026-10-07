import { computed, readonly, ref } from 'vue'

/** Without an interactive challenge, a token takes moments; past this something is wrong. */
export const QUIET_TIMEOUT_MS = 20_000
export const HUMAN_CHECK_FAILED = 'Human check failed. Try again.'
/** Under the widget after a failed run: Cloudflare runs it again by itself. */
export const HUMAN_CHECK_RETRYING = 'Human check failed. Retrying…'
/** The submit button's tooltip while it waits for the human check. */
export const HUMAN_CHECK_WAIT = "Checking you're human…"

/**
 * Whether a form may submit as far as the human check goes: the server said
 * it is off (`siteKey` null; undefined while the page hasn't asked yet), or
 * HumanCheck holds a fresh token (`ready`, its v-model).
 */
export const humanCheckPassed = (siteKey: string | null | undefined, ready: boolean): boolean =>
  siteKey === null || (!!siteKey && ready)

interface Waiter {
  resolve: (token: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * One form's human check, apart from Turnstile's script (HumanCheck.vue feeds
 * it the widget's events; `restart` asks the widget for a new token). `ready`
 * is true while a fresh token is held: false while loading, while a challenge
 * is on screen, once a token expires and after every `reset()`. `token()`
 * still works when not ready: it waits for the next token.
 */
export function createHumanCheckState(restart: () => void, quietTimeoutMs = QUIET_TIMEOUT_MS) {
  const current = ref<string | null>(null)
  /** Shown under the widget: the script is blocked, or the last run failed. */
  const problem = ref<string | null>(null)
  /** Set when the script could not load: every `token()` fails with it. */
  let blocked: string | null = null
  /** The last run failed: the next `token()` starts a new one. */
  let failed = false
  /** Cloudflare is showing a challenge: wait for the person, however long. */
  let interactive = false
  let waiters: Waiter[] = []

  function settle(outcome: { token: string } | { error: string }) {
    const pending = waiters
    waiters = []
    for (const waiter of pending) {
      clearTimeout(waiter.timer)
      if ('token' in outcome) waiter.resolve(outcome.token)
      else waiter.reject(new Error(outcome.error))
    }
  }

  function fail(shown: boolean) {
    current.value = null
    failed = true
    interactive = false
    if (shown) problem.value = HUMAN_CHECK_RETRYING
    settle({ error: HUMAN_CHECK_FAILED })
  }

  /** A token for one submit: the one held, or the next one made. */
  function token(): Promise<string> {
    if (blocked) return Promise.reject(new Error(blocked))
    if (current.value) return Promise.resolve(current.value)
    if (failed) reset()
    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(function expire() {
          // A challenge on screen waits for the person; a silent run that hangs fails.
          if (interactive) {
            waiter.timer = setTimeout(expire, quietTimeoutMs)
            return
          }
          waiters = waiters.filter((w) => w !== waiter)
          reject(new Error(HUMAN_CHECK_FAILED))
        }, quietTimeoutMs),
      }
      waiters.push(waiter)
    })
  }

  /** Spends the token: the widget makes a new one for the next submit. */
  function reset() {
    current.value = null
    failed = false
    interactive = false
    if (!blocked) problem.value = null
    restart()
  }

  return {
    ready: computed(() => current.value !== null),
    problem: readonly(problem),
    token,
    reset,
    /** The script could not load: nothing will ever come. */
    blocked(message: string) {
      blocked = message
      problem.value = message
      settle({ error: message })
    },
    issued(token: string) {
      current.value = token
      failed = false
      interactive = false
      problem.value = null
      settle({ token })
    },
    expired() {
      current.value = null
    },
    /** Cloudflare gave up (it retries by itself); shown under the widget. */
    errored() {
      fail(true)
    },
    /** A challenge went unanswered: Cloudflare puts it back on screen, nothing to show. */
    timedOut() {
      fail(false)
    },
    /** A challenge shows (`true`) or was answered: no token until it's done. */
    challenge(on: boolean) {
      interactive = on
      if (!on) return
      current.value = null
      problem.value = null
    },
    /** The form is gone: whoever waits gets an error. */
    dispose() {
      settle({ error: HUMAN_CHECK_FAILED })
    },
  }
}

export type HumanCheckState = ReturnType<typeof createHumanCheckState>
