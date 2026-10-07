<script setup lang="ts">
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  emailSchema,
  usernameSchema,
  type SignupMode,
} from '@gdt/shared'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import HumanCheck from '@/components/auth/HumanCheck.vue'
import {
  HUMAN_CHECK_NEEDED,
  HUMAN_CHECK_WAIT,
  humanCheckPassed,
  siteKeyAfter,
} from '@/components/auth/human-check'
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
/** The human check's site key while the server has it on (null: off; undefined: not asked yet). */
const siteKey = ref<string | null | undefined>(undefined)
const human = useTemplateRef<InstanceType<typeof HumanCheck>>('human')
/** HumanCheck holds a fresh token. */
const humanReady = ref(false)
const humanOk = computed(() => humanCheckPassed(siteKey.value, humanReady.value))
/** The staff switch: `oauth` leaves only Discord / Google, `closed` nothing. */
const signups = ref<SignupMode>('open')

onMounted(async () => {
  const options = await loadSignInOptions()
  emailFeatures.value = options.emailFeatures
  siteKey.value = options.turnstileSiteKey
  signups.value = options.signups
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
    const turnstile = siteKey.value ? await human.value?.token() : undefined
    await session.register(
      username.value.trim(),
      (emailFeatures.value && email.value.trim()) || null,
      password.value,
      turnstile,
    )
    await router.replace({ name: 'account-new' })
  } catch (cause) {
    const key = await siteKeyAfter(cause)
    if (key) siteKey.value = key
    serverError.value = key
      ? HUMAN_CHECK_NEEDED
      : cause instanceof ApiRequestError && cause.code === 'taken'
        ? emailFeatures.value
          ? 'Username or email taken'
          : 'Username taken'
        : cause instanceof Error
          ? cause.message
          : 'Sign-up failed'
  } finally {
    // A token works once, whatever the answer.
    human.value?.reset()
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
    <p
      v-if="signups !== 'open'"
      class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 text-sm text-amber-200"
      role="status"
    >
      {{
        signups === 'oauth'
          ? 'Sign up with Discord or Google for now'
          : 'Sign-ups are closed for now'
      }}
    </p>
    <form v-if="signups === 'open'" class="flex flex-col gap-4" novalidate @submit.prevent="submit">
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
      <div class="mt-2 flex flex-col">
        <HumanCheck
          v-if="siteKey"
          :key="siteKey"
          ref="human"
          v-model:ready="humanReady"
          :site-key="siteKey"
          action="register"
        />
        <button
          type="submit"
          class="btn-glow w-full rounded-xl"
          :disabled="busy || !humanOk"
          :title="humanOk ? undefined : HUMAN_CHECK_WAIT"
        >
          <UiSpinner v-if="busy" class="size-4" />
          Create account
        </button>
      </div>
    </form>
    <OAuthButtons v-if="signups !== 'closed'" />
    <template #footer>
      Have an account?
      <RouterLink :to="{ name: 'login' }" class="font-semibold text-paimon hover:underline">
        Sign in
      </RouterLink>
    </template>
  </AuthFrame>
</template>
