<script setup lang="ts">
import { usernameSchema, type OAuthPendingResponse } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TimerOff } from 'lucide-vue-next'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import { loadSignInOptions, providerLabel } from '@/components/oauth/oauth'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError, api } from '@/api'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

/**
 * `/oauth`: back from Discord / Google with an account no user has linked.
 * Never matched by email: either a new account (no password; the provider
 * signs it in) or "I have an account", which signs in with a password and
 * links it. The provider account waits in a 15-minute cookie, not the URL.
 */
const session = useSession()
const router = useRouter()

const pending = ref<OAuthPendingResponse | null>(null)
const gone = ref(false)
const username = ref('')
const useEmail = ref(false)
const touched = ref(false)
const usernameTaken = ref(false)
const error = ref('')
const busy = ref(false)
/** "Use as account email" only while the email features are on. */
const emailFeatures = ref(false)

const label = computed(() => (pending.value ? providerLabel(pending.value.provider) : ''))
const usernameError = computed(() =>
  usernameTaken.value
    ? 'Taken'
    : usernameSchema.safeParse(username.value).success
      ? ''
      : '3–32 letters, digits, . - _',
)

onMounted(async () => {
  void loadSignInOptions().then((options) => (emailFeatures.value = options.emailFeatures))
  try {
    pending.value = await api.oauthPending()
    username.value = pending.value.username
  } catch {
    gone.value = true
  }
})

function editUsername(value: string) {
  username.value = value
  usernameTaken.value = false
}

async function create() {
  touched.value = true
  error.value = ''
  if (usernameError.value) return
  busy.value = true
  try {
    await session.oauthRegister(username.value.trim(), emailFeatures.value && useEmail.value)
    await router.replace({ name: 'account-new' })
  } catch (cause) {
    const code = cause instanceof ApiRequestError ? cause.code : ''
    if (code === 'username_taken') usernameTaken.value = true
    else if (code === 'email_taken') {
      useEmail.value = false
      error.value = 'That email belongs to another account'
    } else if (code === 'pending_expired') gone.value = true
    else if (code === 'identity_taken') error.value = 'Already linked. Sign in with it.'
    else error.value = cause instanceof Error ? cause.message : 'Sign-up failed'
  } finally {
    busy.value = false
  }
}

async function cancel() {
  try {
    await api.oauthCancel()
  } finally {
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <AuthFrame :title="gone ? 'Sign-in ran out' : 'Not linked yet'">
    <div v-if="gone" class="flex flex-col items-center gap-6 text-center" role="alert">
      <TimerOff class="size-10 text-paimon" aria-hidden="true" />
      <p class="text-gray-200">Start again from the sign-in page.</p>
      <RouterLink :to="{ name: 'login' }" class="btn-glow w-full rounded-xl">Sign in</RouterLink>
    </div>

    <template v-else-if="pending">
      <div class="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <ProviderMark :provider="pending.provider" class="size-6 shrink-0" />
        <div class="min-w-0">
          <p class="truncate font-semibold text-white">{{ pending.displayName ?? label }}</p>
          <p v-if="pending.email" class="truncate text-sm text-gray-400">{{ pending.email }}</p>
        </div>
      </div>
      <p class="mb-6 text-center text-sm text-gray-300">
        No account is linked to this {{ label }} account.
      </p>
      <p
        v-if="error"
        class="mb-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-300"
        role="alert"
      >
        {{ error }}
      </p>

      <form class="flex flex-col gap-4" novalidate @submit.prevent="create">
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-gray-400">Username</span>
          <input
            :value="username"
            class="glass-input"
            :aria-invalid="(touched && !!usernameError) || undefined"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            @input="editUsername(($event.target as HTMLInputElement).value)"
          />
          <span v-if="touched && usernameError" class="text-sm text-red-300">{{
            usernameError
          }}</span>
        </label>
        <label
          v-if="emailFeatures && pending.email"
          class="flex cursor-pointer items-center gap-3 text-sm text-gray-300"
          title="It stays unconfirmed until you open the link mailed to it"
        >
          <input v-model="useEmail" type="checkbox" class="size-4 accent-amber-500" />
          Use as account email
        </label>
        <button type="submit" class="btn-glow mt-2 w-full rounded-xl" :disabled="busy">
          <UiSpinner v-if="busy" class="size-4" />
          Create account
        </button>
      </form>

      <div class="my-6 flex items-center gap-3 text-xs tracking-wider text-gray-500 uppercase">
        <span class="h-px flex-1 bg-white/10" />
        or
        <span class="h-px flex-1 bg-white/10" />
      </div>
      <RouterLink
        :to="{ name: 'login', query: { link: pending.provider } }"
        class="btn-glass w-full rounded-xl"
        :title="`Sign in with your password to link ${label}`"
      >
        I have an account
      </RouterLink>
    </template>

    <div v-else class="flex justify-center py-6" aria-busy="true">
      <UiSpinner class="size-6 text-paimon" />
    </div>

    <template v-if="pending && !gone" #footer>
      <button type="button" class="text-gray-400 hover:text-white hover:underline" @click="cancel">
        Cancel
      </button>
    </template>
  </AuthFrame>
</template>
