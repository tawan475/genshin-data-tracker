<script setup lang="ts">
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, emailSchema, usernameSchema } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import OAuthButtons from '@/components/oauth/OAuthButtons.vue'
import { loadSignInOptions } from '@/components/oauth/oauth'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError } from '@/api'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

const session = useSession()
const router = useRouter()

const username = ref('')
const email = ref('')
const password = ref('')
const confirm = ref('')
const touched = ref(false)
const serverError = ref('')
const busy = ref(false)
/** The optional email field shows only while the email features are on. */
const emailFeatures = ref(false)

onMounted(async () => {
  emailFeatures.value = (await loadSignInOptions()).emailFeatures
})

// The same schemas the server validates with.
const errors = computed(() => ({
  username: usernameSchema.safeParse(username.value).success ? '' : '3–32 letters, digits, . - _',
  email:
    !emailFeatures.value || !email.value.trim() || emailSchema.safeParse(email.value).success
      ? ''
      : 'Invalid email',
  password:
    password.value.length < MIN_PASSWORD_LENGTH
      ? `Min ${MIN_PASSWORD_LENGTH} characters`
      : password.value.length > MAX_PASSWORD_LENGTH
        ? `Max ${MAX_PASSWORD_LENGTH} characters`
        : '',
  confirm: confirm.value !== password.value ? 'Does not match' : '',
}))
const valid = computed(() => Object.values(errors.value).every((e) => !e))
const show = (field: keyof typeof errors.value) => (touched.value ? errors.value[field] : '')

async function submit() {
  touched.value = true
  serverError.value = ''
  if (!valid.value) return
  busy.value = true
  try {
    await session.register(
      username.value.trim(),
      (emailFeatures.value && email.value.trim()) || null,
      password.value,
    )
    await router.replace({ name: 'account-new' })
  } catch (cause) {
    serverError.value =
      cause instanceof ApiRequestError && cause.code === 'taken'
        ? emailFeatures.value
          ? 'Username or email taken'
          : 'Username taken'
        : cause instanceof Error
          ? cause.message
          : 'Sign-up failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthFrame title="Create account">
    <p
      v-if="serverError"
      class="mb-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-300"
      role="alert"
    >
      {{ serverError }}
    </p>
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-gray-400">Username</span>
        <input
          v-model="username"
          class="glass-input"
          :aria-invalid="!!show('username') || undefined"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
        />
        <span v-if="show('username')" class="text-sm text-red-300">{{ show('username') }}</span>
      </label>
      <label v-if="emailFeatures" class="flex flex-col gap-2">
        <span class="text-sm font-medium text-gray-400"
          >Email <span class="text-gray-500">(optional)</span></span
        >
        <input
          v-model="email"
          class="glass-input"
          type="email"
          :aria-invalid="!!show('email') || undefined"
          autocomplete="email"
        />
        <span v-if="show('email')" class="text-sm text-red-300">{{ show('email') }}</span>
      </label>
      <label class="flex flex-col gap-2">
        <span class="text-sm font-medium text-gray-400">Password</span>
        <input
          v-model="password"
          class="glass-input"
          type="password"
          :aria-invalid="!!show('password') || undefined"
          autocomplete="new-password"
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
        />
        <span v-if="show('confirm')" class="text-sm text-red-300">{{ show('confirm') }}</span>
      </label>
      <button type="submit" class="btn-glow mt-2 w-full rounded-xl" :disabled="busy">
        <UiSpinner v-if="busy" class="size-4" />
        Create account
      </button>
    </form>
    <OAuthButtons />
    <template #footer>
      Have an account?
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-paimon hover:underline">
        Sign in
      </RouterLink>
    </template>
  </AuthFrame>
</template>
