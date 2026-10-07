<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await session.login(login.value.trim(), password.value)
    const next =
      typeof route.query.next === 'string' && route.query.next.startsWith('/app')
        ? route.query.next
        : '/app'
    await router.replace(next)
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
        Sign in
      </button>
    </form>
    <template #footer>
      New?
      <RouterLink :to="{ name: 'register' }" class="font-semibold text-paimon hover:underline">
        Create an account
      </RouterLink>
    </template>
  </AuthFrame>
</template>
