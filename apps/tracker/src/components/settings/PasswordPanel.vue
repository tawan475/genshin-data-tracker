<script setup lang="ts">
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@gdt/shared'
import { computed, nextTick, ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError } from '@/api'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/** Change password. The server signs every other device out; this one stays signed in. */
const session = useSession()
const feedback = useFeedback()

const current = ref('')
const next = ref('')
const confirm = ref('')
const touched = ref(false)
const currentServerError = ref('')
const formError = ref('')
const busy = ref(false)
const form = ref<HTMLFormElement>()

const currentError = computed(
  () => currentServerError.value || (current.value ? '' : 'Enter your current password'),
)
const nextError = computed(() => {
  if (next.value.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters`
  if (next.value.length > MAX_PASSWORD_LENGTH) return `At most ${MAX_PASSWORD_LENGTH} characters`
  if (next.value === current.value) return 'Choose a password different from the current one'
  return ''
})
const confirmError = computed(() => (confirm.value !== next.value ? 'Passwords do not match' : ''))
const valid = computed(() => !currentError.value && !nextError.value && !confirmError.value)

function editCurrent(value: string) {
  current.value = value
  currentServerError.value = ''
}

/** The inputs were disabled while busy; once enabled again, send focus back. */
async function focusCurrent() {
  busy.value = false
  await nextTick()
  const input = form.value?.querySelector<HTMLInputElement>(
    'input[autocomplete="current-password"]',
  )
  input?.focus()
  input?.select()
}

async function submit() {
  touched.value = true
  formError.value = ''
  currentServerError.value = ''
  if (!valid.value) return
  busy.value = true
  try {
    await session.changePassword(current.value, next.value)
    current.value = ''
    next.value = ''
    confirm.value = ''
    touched.value = false
    feedback.toast({
      tone: 'success',
      title: 'Password changed',
      detail: 'Every other device was signed out. This one stays signed in.',
    })
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'invalid_credentials') {
      currentServerError.value = 'Current password is wrong'
      await focusCurrent()
    } else {
      formError.value = cause instanceof Error ? cause.message : 'Could not change the password.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiPanel title="Password">
    <form ref="form" class="flex max-w-md flex-col gap-4" novalidate @submit.prevent="submit">
      <!-- Lets password managers file the new password under the right login. -->
      <input
        type="text"
        name="username"
        autocomplete="username"
        :value="session.me?.username ?? ''"
        class="hidden"
        readonly
        tabindex="-1"
        aria-hidden="true"
      />
      <UiField
        v-slot="{ id, describedBy }"
        label="Current password"
        :error="touched ? currentError : ''"
      >
        <UiInput
          :id="id"
          :model-value="current"
          type="password"
          autocomplete="current-password"
          :aria-describedby="describedBy"
          :invalid="touched && !!currentError"
          :disabled="busy"
          required
          @update:model-value="editCurrent"
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        label="New password"
        :hint="`At least ${MIN_PASSWORD_LENGTH} characters`"
        :error="touched ? nextError : ''"
      >
        <UiInput
          :id="id"
          v-model="next"
          type="password"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :invalid="touched && !!nextError"
          :disabled="busy"
          required
        />
      </UiField>
      <UiField
        v-slot="{ id, describedBy }"
        label="Confirm new password"
        :error="touched ? confirmError : ''"
      >
        <UiInput
          :id="id"
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          :aria-describedby="describedBy"
          :invalid="touched && !!confirmError"
          :disabled="busy"
          required
        />
      </UiField>
      <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
      <div class="flex flex-wrap items-center gap-3">
        <UiButton type="submit" variant="primary" :loading="busy"> Change password </UiButton>
      </div>
    </form>
  </UiPanel>
</template>
