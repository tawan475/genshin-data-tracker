<script setup lang="ts">
import { emailSchema, usernameSchema } from '@gdt/shared'
import { computed, nextTick, ref } from 'vue'
import { Pencil } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError, api } from '@/api'
import { t } from '@/i18n'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Who you are: user id, username, email; the last two edit in place. An
 * unconfirmed email has a Verify action (a confirmation link by mail; a new
 * email gets one by itself) while the server can send email.
 *
 * While the email features are paused (`emailFeatures`), only the username
 * edits; an email set before shows read-only (it still signs in) with Remove.
 */
const session = useSession()
const feedback = useFeedback()

const emailFeatures = computed(() => session.me?.emailFeatures === true)

const editing = ref(false)
const username = ref('')
const email = ref('')
const touched = ref(false)
const busy = ref(false)
const serverErrors = ref<{ username?: string; email?: string }>({})
const form = ref<HTMLFormElement>()

function startEdit() {
  username.value = session.me?.username ?? ''
  email.value = session.me?.email ?? ''
  touched.value = false
  serverErrors.value = {}
  editing.value = true
  void nextTick(() => form.value?.querySelector('input')?.focus())
}

const usernameChanged = computed(() => username.value.trim() !== session.me?.username)
const emailChanged = computed(
  () =>
    emailFeatures.value &&
    (email.value.trim().toLowerCase() || null) !== (session.me?.email ?? null),
)

const errors = computed(() => ({
  username:
    serverErrors.value.username ??
    (usernameSchema.safeParse(username.value).success ? '' : t('auth.usernameRule')),
  email:
    serverErrors.value.email ??
    (!emailFeatures.value || !email.value.trim() || emailSchema.safeParse(email.value).success
      ? ''
      : t('auth.invalidEmail')),
}))
const show = (field: keyof typeof errors.value) => (touched.value ? errors.value[field] : '')
const valid = computed(() => Object.values(errors.value).every((e) => !e))

async function save() {
  touched.value = true
  serverErrors.value = {}
  if (!valid.value || (!usernameChanged.value && !emailChanged.value)) return
  busy.value = true
  try {
    const sentTo = emailChanged.value ? email.value.trim().toLowerCase() : ''
    await session.updateProfile({
      ...(usernameChanged.value ? { username: username.value.trim() } : {}),
      ...(emailChanged.value ? { email: email.value.trim() || null } : {}),
    })
    editing.value = false
    feedback.toast({
      tone: 'success',
      title: t('settings.profile.updated'),
      detail:
        sentTo && session.me?.emailEnabled
          ? t('settings.profile.confirmationSent', { email: sentTo })
          : undefined,
    })
  } catch (cause) {
    const code = cause instanceof ApiRequestError ? cause.code : ''
    if (code === 'username_taken') serverErrors.value = { username: t('common.taken') }
    else if (code === 'email_taken') serverErrors.value = { email: t('common.taken') }
    else feedback.error(t('settings.profile.notSaved'), cause)
  } finally {
    busy.value = false
  }
}

const sending = ref(false)

async function sendConfirmation() {
  const to = session.me?.email
  if (!to) return
  sending.value = true
  try {
    await api.sendVerifyEmail()
    feedback.toast({
      tone: 'success',
      title: t('settings.profile.linkSent'),
      detail: t('settings.profile.checkInbox', { email: to }),
    })
  } catch (cause) {
    // Confirmed in another tab meanwhile: just show it.
    if (cause instanceof ApiRequestError && cause.code === 'already_verified') {
      session.emailConfirmed(to)
    } else feedback.error(t('settings.profile.linkNotSent'), cause)
  } finally {
    sending.value = false
  }
}

const removing = ref(false)

/** While email is paused: the one change left to an email set before. */
async function removeEmail() {
  const ok = await feedback.confirm({
    title: t('settings.profile.removeEmailTitle'),
    detail: t('settings.profile.removeEmailDetail'),
    confirmLabel: t('common.remove'),
    tone: 'danger',
  })
  if (!ok) return
  removing.value = true
  try {
    await session.updateProfile({ email: null })
    feedback.toast({ tone: 'success', title: t('settings.profile.emailRemoved') })
  } catch (cause) {
    feedback.error(t('settings.profile.emailNotRemoved'), cause)
  } finally {
    removing.value = false
  }
}

const fields = { username, email }

/** Typing in a field clears the server's complaint about it. */
function edit(field: keyof typeof fields, value: string) {
  fields[field].value = value
  if (serverErrors.value[field]) serverErrors.value = { ...serverErrors.value, [field]: undefined }
}
</script>

<template>
  <UiPanel :title="$t('settings.profile.title')">
    <template v-if="session.me && !editing" #actions>
      <UiButton size="sm" variant="secondary" @click="startEdit">
        <Pencil class="size-4" aria-hidden="true" />
        {{ $t('common.edit') }}
      </UiButton>
    </template>

    <dl
      v-if="session.me && !editing"
      class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-x-6 gap-y-4"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <dt class="text-sm text-text-muted">{{ $t('settings.profile.userId') }}</dt>
        <dd class="font-mono select-all">{{ session.me.id }}</dd>
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <dt class="text-sm text-text-muted">{{ $t('common.username') }}</dt>
        <dd class="min-w-0 truncate font-mono">{{ session.me.username }}</dd>
      </div>
      <div v-if="emailFeatures" class="flex min-w-0 flex-col gap-1">
        <dt class="text-sm text-text-muted">{{ $t('common.email') }}</dt>
        <dd v-if="session.me.email" class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="min-w-0 truncate">{{ session.me.email }}</span>
          <UiBadge
            :tone="session.me.emailVerified ? 'success' : 'warning'"
            :title="
              session.me.emailVerified
                ? $t('settings.profile.verifiedTitle')
                : $t('settings.profile.unverifiedTitle')
            "
          >
            {{
              session.me.emailVerified
                ? $t('settings.profile.verified')
                : $t('settings.profile.unverified')
            }}
          </UiBadge>
          <template v-if="!session.me.emailVerified">
            <UiButton
              v-if="session.me.emailEnabled"
              size="sm"
              :loading="sending"
              :title="$t('settings.profile.verifyTitle')"
              @click="sendConfirmation"
            >
              {{ $t('settings.profile.verify') }}
            </UiButton>
            <span
              v-else
              class="text-sm text-text-muted"
              :title="$t('settings.profile.emailUnavailableTitle')"
            >
              {{ $t('settings.profile.emailUnavailable') }}
            </span>
          </template>
        </dd>
        <dd v-else class="text-text-muted" :title="$t('settings.profile.addEmailTitle')">—</dd>
      </div>
      <div v-else-if="session.me.email" class="flex min-w-0 flex-col gap-1">
        <dt class="text-sm text-text-muted">{{ $t('common.email') }}</dt>
        <dd class="flex min-w-0 flex-wrap items-center gap-2">
          <span class="min-w-0 truncate" :title="$t('settings.profile.alsoSignsIn')">{{
            session.me.email
          }}</span>
          <UiButton size="sm" :loading="removing" @click="removeEmail">
            {{ $t('common.remove') }}
          </UiButton>
        </dd>
      </div>
    </dl>

    <form
      v-else-if="session.me"
      ref="form"
      class="flex flex-col gap-4"
      novalidate
      @submit.prevent="save"
    >
      <UiField
        v-slot="{ id, describedBy }"
        :label="$t('common.username')"
        :error="show('username')"
      >
        <UiInput
          :id="id"
          :model-value="username"
          :aria-describedby="describedBy"
          :invalid="!!show('username')"
          :disabled="busy"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          @update:model-value="edit('username', $event)"
        />
      </UiField>
      <UiField
        v-if="emailFeatures"
        v-slot="{ id, describedBy }"
        :label="$t('common.email')"
        optional
        :error="show('email')"
      >
        <UiInput
          :id="id"
          :model-value="email"
          type="email"
          :aria-describedby="describedBy"
          :invalid="!!show('email')"
          :disabled="busy"
          autocomplete="email"
          @update:model-value="edit('email', $event)"
        />
      </UiField>
      <div class="flex flex-wrap items-center gap-3">
        <UiButton
          type="submit"
          variant="primary"
          :loading="busy"
          :disabled="!usernameChanged && !emailChanged"
        >
          {{ $t('common.save') }}
        </UiButton>
        <UiButton variant="ghost" :disabled="busy" @click="editing = false">{{
          $t('common.cancel')
        }}</UiButton>
      </div>
    </form>
  </UiPanel>
</template>
