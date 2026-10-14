<script setup lang="ts">
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@gdt/shared'
import { computed, nextTick, ref } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError } from '@/api'
import { t } from '@/i18n'
import { errorText } from '@/i18n/api-errors'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Change password: the server signs every other device out; this one stays
 * signed in. An account made with Discord or Google has none yet: it sets
 * one with just the session.
 */
const session = useSession()
const feedback = useFeedback()

const setting = computed(() => session.me?.hasPassword === false)

const current = ref('')
const next = ref('')
const confirm = ref('')
const touched = ref(false)
const currentServerError = ref('')
const formError = ref('')
const busy = ref(false)
const form = ref<HTMLFormElement>()

const currentError = computed(() =>
  setting.value
    ? ''
    : currentServerError.value || (current.value ? '' : t('settings.password.enterCurrent')),
)
const nextError = computed(() => {
  if (next.value.length < MIN_PASSWORD_LENGTH) {
    return t('settings.password.atLeast', { n: MIN_PASSWORD_LENGTH })
  }
  if (next.value.length > MAX_PASSWORD_LENGTH) {
    return t('settings.password.atMost', { n: MAX_PASSWORD_LENGTH })
  }
  if (!setting.value && next.value === current.value) return t('settings.password.different')
  return ''
})
const confirmError = computed(() =>
  confirm.value !== next.value ? t('settings.password.mismatch') : '',
)
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
    const first = setting.value
    if (first) await session.setPassword(next.value)
    else await session.changePassword(current.value, next.value)
    current.value = ''
    next.value = ''
    confirm.value = ''
    touched.value = false
    feedback.toast(
      first
        ? {
            tone: 'success',
            title: t('settings.password.setToast'),
            detail: t('settings.password.setDetail'),
          }
        : {
            tone: 'success',
            title: t('settings.password.changedToast'),
            detail: t('settings.password.changedDetail'),
          },
    )
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'invalid_credentials') {
      currentServerError.value = t('settings.password.currentWrong')
      await focusCurrent()
    } else {
      formError.value = errorText(cause, t('settings.password.couldNotChange'))
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiPanel :title="setting ? $t('settings.password.setTitle') : $t('settings.password.title')">
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
        v-if="!setting"
        v-slot="{ id, describedBy }"
        :label="$t('settings.password.current')"
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
        :label="setting ? $t('common.password') : $t('settings.password.new')"
        :hint="$t('settings.password.atLeast', { n: MIN_PASSWORD_LENGTH })"
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
        :label="setting ? $t('settings.password.confirm') : $t('settings.password.confirmNew')"
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
        <UiButton type="submit" variant="primary" :loading="busy">
          {{ setting ? $t('settings.password.set') : $t('settings.password.change') }}
        </UiButton>
      </div>
    </form>
  </UiPanel>
</template>
