<script setup lang="ts">
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, emailSchema, usernameSchema } from '@gdt/shared'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
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

// The same schemas the server validates with, so messages match.
const usernameError = computed(() => {
  const result = usernameSchema.safeParse(username.value)
  return result.success ? '' : (result.error.issues[0]?.message ?? 'Invalid username')
})
const emailError = computed(() =>
  emailSchema.safeParse(email.value).success ? '' : 'Enter a valid email',
)
const passwordError = computed(() =>
  password.value.length < MIN_PASSWORD_LENGTH
    ? `At least ${MIN_PASSWORD_LENGTH} characters`
    : password.value.length > MAX_PASSWORD_LENGTH
      ? `At most ${MAX_PASSWORD_LENGTH} characters`
      : '',
)
const confirmError = computed(() =>
  confirm.value !== password.value ? 'Passwords do not match' : '',
)
const valid = computed(
  () => !usernameError.value && !emailError.value && !passwordError.value && !confirmError.value,
)

async function submit() {
  touched.value = true
  serverError.value = ''
  if (!valid.value) return
  busy.value = true
  try {
    await session.register(username.value.trim(), email.value.trim(), password.value)
    await router.replace({ name: 'account-new' })
  } catch (cause) {
    serverError.value =
      cause instanceof ApiRequestError && cause.code === 'taken'
        ? 'That username or email is already registered.'
        : cause instanceof Error
          ? cause.message
          : 'Could not create the account.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthFrame title="Create an account" subtitle="Then link Irminsul or import GOOD files.">
    <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
      <UiField
        v-slot="{ id, describedBy }"
        label="Username"
        hint="3–32 letters, digits, dot, dash or underscore"
        :error="touched ? usernameError : ''"
      >
        <UiInput
          :id="id"
          v-model="username"
          :aria-describedby="describedBy"
          :invalid="touched && !!usernameError"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        label="Email"
        hint="Used to connect Google or Discord sign-in later"
        :error="touched ? emailError : ''"
      >
        <UiInput
          :id="id"
          v-model="email"
          type="email"
          :aria-describedby="describedBy"
          :invalid="touched && !!emailError"
          autocomplete="email"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        label="Password"
        :hint="`At least ${MIN_PASSWORD_LENGTH} characters`"
        :error="touched ? passwordError : ''"
      >
        <UiInput
          :id="id"
          v-model="password"
          type="password"
          :aria-describedby="describedBy"
          :invalid="touched && !!passwordError"
          autocomplete="new-password"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        label="Confirm password"
        :error="touched ? confirmError : ''"
      >
        <UiInput
          :id="id"
          v-model="confirm"
          type="password"
          :aria-describedby="describedBy"
          :invalid="touched && !!confirmError"
          autocomplete="new-password"
        />
      </UiField>
      <p v-if="serverError" class="text-sm text-danger-text" role="alert">{{ serverError }}</p>
      <UiButton type="submit" variant="primary" block :loading="busy">
        {{ busy ? 'Creating account…' : 'Create account' }}
      </UiButton>
    </form>
    <template #footer>
      Already have an account?
      <RouterLink :to="{ name: 'login' }" class="font-medium text-accent-text hover:underline"
        >Sign in</RouterLink
      >
    </template>
  </AuthFrame>
</template>
