<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadTurnstile, type TurnstileApi } from '@/lib/turnstile'

/**
 * The human check (Cloudflare Turnstile) for one form: rendered at once,
 * invisible unless Cloudflare wants an interaction (appearance
 * interaction-only), so most people only see the form. Put it right above
 * the submit button, in the button's own wrapper: it takes no room (and adds
 * no gap) until a challenge shows. `token()` gives the form a fresh token
 * (waiting while it's being made, however long an interactive challenge
 * takes); call `reset()` after every submit, refused or not, since a token
 * works once. Fails fast with a message when the script is blocked. Never
 * hidden with display: none (the widget would not run).
 */
const props = withDefaults(
  defineProps<{
    siteKey: string
    action: 'login' | 'register'
    theme?: 'light' | 'dark' | 'auto'
  }>(),
  { theme: 'dark' },
)

/** Without an interactive challenge, a token takes moments; past this something is wrong. */
const QUIET_TIMEOUT_MS = 20_000
const FAILED = 'Human check failed. Try again.'

const container = ref<HTMLElement | null>(null)
/** A challenge is on screen: space it from the button. */
const shown = ref(false)
let resize: ResizeObserver | null = null
let api: TurnstileApi | null = null
let widgetId: string | null = null
let current: string | null = null
/** Set when the script could not load: every `token()` fails with it. */
let blocked: string | null = null
/** The last run failed: the next `token()` starts a new one. */
let failed = false
/** Cloudflare is showing a challenge: wait for the person, however long. */
let interactive = false

interface Waiter {
  resolve: (token: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
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

onMounted(async () => {
  if (container.value) {
    resize = new ResizeObserver(() => {
      shown.value = (container.value?.offsetHeight ?? 0) > 0
    })
    resize.observe(container.value)
  }
  try {
    api = await loadTurnstile()
  } catch (error) {
    blocked = error instanceof Error ? error.message : FAILED
    settle({ error: blocked })
    return
  }
  if (!container.value) return
  widgetId =
    api.render(container.value, {
      sitekey: props.siteKey,
      action: props.action,
      theme: props.theme,
      appearance: 'interaction-only',
      size: 'flexible',
      'response-field': false,
      'refresh-expired': 'auto',
      retry: 'auto',
      callback: (token) => {
        current = token
        failed = false
        interactive = false
        settle({ token })
      },
      'expired-callback': () => {
        current = null
      },
      'error-callback': () => {
        current = null
        failed = true
        interactive = false
        settle({ error: FAILED })
      },
      'timeout-callback': () => {
        current = null
        failed = true
        interactive = false
        settle({ error: FAILED })
      },
      'before-interactive-callback': () => {
        interactive = true
      },
      'after-interactive-callback': () => {
        interactive = false
      },
    }) ?? null
})

onBeforeUnmount(() => {
  resize?.disconnect()
  settle({ error: FAILED })
  if (api && widgetId) api.remove(widgetId)
  widgetId = null
})

/** A token for one submit: the one ready, or the next one made. */
function token(): Promise<string> {
  if (blocked) return Promise.reject(new Error(blocked))
  if (current) return Promise.resolve(current)
  if (failed) reset()
  return new Promise<string>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      timer: setTimeout(function expire() {
        // A challenge on screen waits for the person; a silent run that hangs fails.
        if (interactive) {
          waiter.timer = setTimeout(expire, QUIET_TIMEOUT_MS)
          return
        }
        waiters = waiters.filter((w) => w !== waiter)
        reject(new Error(FAILED))
      }, QUIET_TIMEOUT_MS),
    }
    waiters.push(waiter)
  })
}

/** Spends the token: the widget makes a new one for the next submit. */
function reset() {
  current = null
  failed = false
  interactive = false
  if (api && widgetId) api.reset(widgetId)
}

defineExpose({ token, reset })
</script>

<template>
  <div ref="container" class="flex justify-center" :class="{ 'mb-4': shown }" />
</template>
