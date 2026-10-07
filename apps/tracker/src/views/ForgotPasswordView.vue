<script setup lang="ts">
import { ref } from 'vue'
import { MailCheck } from 'lucide-vue-next'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError, api } from '@/api'
import AuthFrame from './AuthFrame.vue'

/**
 * Asks for a reset link. The server answers the same whether or not the
 * account exists or has a confirmed email, so this page does too.
 */
const login = ref('')
const busy = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await api.forgotPassword(login.value.trim())
    sent.value = true
  } catch (cause) {
    error.value =
      cause instanceof ApiRequestError && cause.code === 'rate_limited'
        ? 'Too many requests, try again in a minute'
        : cause instanceof Error
          ? cause.message
          : 'Request failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthFrame title="Reset password">
    <div v-if="sent" class="flex flex-col items-center gap-4 text-center" role="status">
      <MailCheck class="size-10 text-paimon" aria-hidden="true" />
      <p class="text-balance text-gray-200">
        If that account has a confirmed email, we sent a link.
      </p>
      <p class="text-sm text-gray-400" title="Ask the admin for a link if you have none">
        Valid for 30 minutes. No confirmed email? Ask the admin.
      </p>
    </div>
    <template v-else>
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
        <button type="submit" class="btn-glow mt-2 w-full rounded-xl" :disabled="busy || !login">
          <UiSpinner v-if="busy" class="size-4" />
          Send link
        </button>
      </form>
    </template>
    <template #footer>
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-paimon hover:underline">
        Back to sign in
      </RouterLink>
    </template>
  </AuthFrame>
</template>
