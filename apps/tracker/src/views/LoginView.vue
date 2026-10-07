<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import OAuthButtons from '@/components/oauth/OAuthButtons.vue'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import { isProvider, oauthErrorText, providerLabel } from '@/components/oauth/oauth'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError } from '@/api'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

const session = useSession()
const router = useRouter()
const route = useRoute()

const login = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

const next = computed(() =>
  typeof route.query.next === 'string' && route.query.next.startsWith('/app')
    ? route.query.next
    : undefined,
)

/** `?link=discord`: from "I have an account" on /oauth; signing in also links that account. */
const linking = computed(() => (isProvider(route.query.link) ? route.query.link : null))

onMounted(() => {
  // Back from Discord / Google with a problem: say it once, then drop it from the URL.
  const code = route.query.oauth_error
  if (typeof code === 'string') {
    error.value = oauthErrorText(code)
    void router.replace({ query: { ...route.query, oauth_error: undefined } })
  }
})

async function submit() {
  error.value = ''
  busy.value = true
  try {
    if (linking.value) {
      const result = await session.oauthLinkLogin(login.value.trim(), password.value)
      // Linked, or why not: Settings says which and can link it again.
      await router.replace({
        name: 'settings',
        query: result.linked ? { linked: result.linked } : { oauth_error: result.problem },
      })
      return
    }
    await session.login(login.value.trim(), password.value)
    await router.replace(next.value ?? '/app')
  } catch (cause) {
    error.value =
      cause instanceof ApiRequestError && cause.code === 'invalid_credentials'
        ? 'Wrong username or password'
        : cause instanceof Error
          ? cause.message
          : 'Sign-in failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthFrame title="Welcome back">
    <p
      v-if="linking"
      class="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-200"
    >
      <ProviderMark :provider="linking" class="size-5 shrink-0" />
      Sign in to link {{ providerLabel(linking) }}
    </p>
    <p
      v-if="error"
      class="mb-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-300"
      role="alert"
    >
      {{ error }}
    </p>
    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-gray-400">Username or email</span>
        <input
          v-model="login"
          class="glass-input"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Aether"
          required
        />
      </label>
      <label class="flex flex-col gap-2">
        <span class="flex items-baseline justify-between gap-3">
          <span class="text-sm font-medium text-gray-400">Password</span>
          <RouterLink
            :to="{ name: 'forgot-password' }"
            class="text-sm text-paimon hover:underline"
            title="Reset it by email, or ask the admin"
          >
            Forgot password?
          </RouterLink>
        </span>
        <input
          v-model="password"
          class="glass-input"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
          required
        />
      </label>
      <button
        type="submit"
        class="btn-glow mt-2 w-full rounded-xl"
        :disabled="busy || !login || !password"
      >
        <UiSpinner v-if="busy" class="size-4" />
        {{ linking ? 'Sign in and link' : 'Sign in' }}
      </button>
    </form>
    <OAuthButtons v-if="!linking" :next="next" />
    <template #footer>
      <template v-if="linking">
        <RouterLink
          :to="{ name: 'oauth-continue' }"
          class="font-semibold text-paimon hover:underline"
          title="No password? Sign in with your other provider, then link this one in Settings"
        >
          Back
        </RouterLink>
      </template>
      <template v-else>
        New?
        <RouterLink :to="{ name: 'register' }" class="font-semibold text-paimon hover:underline">
          Create an account
        </RouterLink>
      </template>
    </template>
  </AuthFrame>
</template>
