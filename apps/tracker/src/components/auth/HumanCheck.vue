<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadTurnstile, type TurnstileApi } from '@/lib/turnstile'
import {
  HUMAN_CHECK_FAILED,
  HUMAN_CHECK_RETRYING,
  createHumanCheckState,
} from './human-check-state'

/**
 * The human check (Cloudflare Turnstile) for one form: rendered at once,
 * invisible unless Cloudflare wants an interaction (appearance
 * interaction-only), so most people only see the form. Put it right above
 * the submit button, in the button's own wrapper: it takes no room (and adds
 * no gap) until a challenge or a problem shows. `v-model:ready` is true while
 * a fresh token is held: keep the submit button disabled until then.
 * `token()` gives the form that token (or waits for the next one, however
 * long an interactive challenge takes); call `reset()` after every submit,
 * refused or not, since a token works once. A blocked script says so here.
 * Never hidden with display: none (the widget would not run).
 */
const props = withDefaults(
  defineProps<{
    siteKey: string
    action: 'login' | 'register'
    theme?: 'light' | 'dark' | 'auto'
  }>(),
  { theme: 'dark' },
)

const ready = defineModel<boolean>('ready', { default: false })

const container = ref<HTMLElement | null>(null)
/** A challenge is on screen: space it from the button. */
const shown = ref(false)
let resize: ResizeObserver | null = null
let api: TurnstileApi | null = null
let widgetId: string | null = null

const state = createHumanCheckState(() => {
  if (api && widgetId) api.reset(widgetId)
})
const problem = state.problem

watch(
  state.ready,
  (value) => {
    ready.value = value
  },
  { immediate: true },
)

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
    state.blocked(error instanceof Error ? error.message : HUMAN_CHECK_FAILED)
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
      callback: (token) => state.issued(token),
      'expired-callback': () => state.expired(),
      'error-callback': () => state.errored(),
      'timeout-callback': () => state.timedOut(),
      'before-interactive-callback': () => state.challenge(true),
      'after-interactive-callback': () => state.challenge(false),
    }) ?? null
})

onBeforeUnmount(() => {
  resize?.disconnect()
  state.dispose()
  ready.value = false
  if (api && widgetId) api.remove(widgetId)
  widgetId = null
})

defineExpose({ token: state.token, reset: state.reset })
</script>

<template>
  <div class="flex flex-col">
    <div ref="container" class="flex justify-center" :class="{ 'mb-4': shown }" />
    <p
      v-if="problem"
      class="mb-4 text-center text-sm text-red-300"
      role="alert"
      :title="problem === HUMAN_CHECK_RETRYING ? 'Reload the page if it stays' : undefined"
    >
      {{ problem }}
    </p>
  </div>
</template>
