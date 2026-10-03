<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
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
        ? 'That username, email or password is not right.'
        : cause instanceof Error
          ? cause.message
          : 'Could not sign in.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthFrame title="Sign in" subtitle="Your snapshots, artifacts and materials over time.">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UiField v-slot="{ id }" label="Username or email">
        <UiInput
          :id="id"
          v-model="login"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        />
      </UiField>
      <UiField v-slot="{ id }" label="Password">
        <UiInput
          :id="id"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </UiField>
      <p v-if="error" class="text-sm text-danger-text" role="alert">{{ error }}</p>
      <UiButton
        type="submit"
        variant="primary"
        block
        :loading="busy"
        :disabled="!login || !password"
      >
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </UiButton>
      <p class="text-sm text-text-muted">
        Your password is stretched on this device before anything is sent; the server never sees it.
      </p>
    </form>
    <template #footer>
      New here?
      <RouterLink :to="{ name: 'register' }" class="font-medium text-accent-text hover:underline"
        >Create an account</RouterLink
      >
    </template>
  </AuthFrame>
</template>
