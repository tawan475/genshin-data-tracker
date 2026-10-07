<script setup lang="ts">
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, linkToken } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LinkProblem from '@/components/public/LinkProblem.vue'
import { linkProblem, type LinkProblem as Problem } from '@/components/public/link-problem'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError, api } from '@/api'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

/**
 * `/reset-password?token=…` from a reset email or an admin. The link is
 * checked first (without using it up); setting the password signs every
 * device out and this browser in.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const feedback = useFeedback()

const token = typeof route.query.token === 'string' ? route.query.token : ''
const username = ref<string | null>(null)
const problem = ref<Problem | null>(null)

const password = ref('')
const confirm = ref('')
const touched = ref(false)
const busy = ref(false)
const error = ref('')

// The same rules as signing up.
const errors = computed(() => ({
  password:
    password.value.length < MIN_PASSWORD_LENGTH
      ? `Min ${MIN_PASSWORD_LENGTH} characters`
      : password.value.length > MAX_PASSWORD_LENGTH
        ? `Max ${MAX_PASSWORD_LENGTH} characters`
        : '',
  confirm: confirm.value !== password.value ? 'Does not match' : '',
}))
const show = (field: keyof typeof errors.value) => (touched.value ? errors.value[field] : '')

const isLinkError = (cause: unknown) =>
  cause instanceof ApiRequestError &&
  ['token_expired', 'token_used', 'token_invalid'].includes(cause.code)

onMounted(async () => {
  if (!linkToken.safeParse(token).success) {
    problem.value = linkProblem(new ApiRequestError(400, 'token_invalid', ''))
    return
  }
  try {
    username.value = (await api.checkResetLink(token)).username
  } catch (cause) {
    problem.value = linkProblem(cause)
  }
})

async function submit() {
  touched.value = true
  error.value = ''
  if (errors.value.password || errors.value.confirm) return
  busy.value = true
  try {
    await session.resetPassword(token, password.value)
    feedback.toast({
      tone: 'success',
      title: 'Password changed',
      detail: 'Every other device was signed out.',
    })
    await router.replace({ name: 'home' })
  } catch (cause) {
    if (isLinkError(cause)) problem.value = linkProblem(cause)
    else
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

const title = computed(() => problem.value?.title ?? 'New password')
</script>

<template>
  <AuthFrame :title="title">
    <LinkProblem
      v-if="problem"
      :problem="problem"
      :retry="{ name: 'forgot-password' }"
      retry-label="Request a new link"
    />
    <div v-else-if="username === null" class="flex justify-center py-6" aria-busy="true">
      <UiSpinner class="size-6 text-paimon" />
    </div>
    <template v-else>
      <p class="-mt-4 mb-6 text-center text-gray-400">
        for <span class="font-semibold text-gray-200">{{ username }}</span>
      </p>
      <p
        v-if="error"
        class="mb-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-300"
        role="alert"
      >
        {{ error }}
      </p>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <!-- Lets password managers file the new password under the right login. -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          :value="username"
          class="hidden"
          readonly
          tabindex="-1"
          aria-hidden="true"
        />
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-gray-400">New password</span>
          <input
            v-model="password"
            class="glass-input"
            type="password"
            :aria-invalid="!!show('password') || undefined"
            autocomplete="new-password"
            :disabled="busy"
          />
          <span v-if="show('password')" class="text-sm text-red-300">{{ show('password') }}</span>
        </label>
        <label class="flex flex-col gap-2">
          <span class="text-sm font-medium text-gray-400">Confirm password</span>
          <input
            v-model="confirm"
            class="glass-input"
            type="password"
            :aria-invalid="!!show('confirm') || undefined"
            autocomplete="new-password"
            :disabled="busy"
          />
          <span v-if="show('confirm')" class="text-sm text-red-300">{{ show('confirm') }}</span>
        </label>
        <button
          type="submit"
          class="btn-glow mt-2 w-full rounded-xl"
          :disabled="busy"
          title="Signs every other device out"
        >
          <UiSpinner v-if="busy" class="size-4" />
          Set password
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
