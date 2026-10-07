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
    (usernameSchema.safeParse(username.value).success ? '' : '3–32 letters, digits, . - _'),
  email:
    serverErrors.value.email ??
    (!emailFeatures.value || !email.value.trim() || emailSchema.safeParse(email.value).success
      ? ''
      : 'Invalid email'),
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
      title: 'Profile updated',
      detail: sentTo && session.me?.emailEnabled ? `Confirmation sent to ${sentTo}` : undefined,
    })
  } catch (cause) {
    const code = cause instanceof ApiRequestError ? cause.code : ''
    if (code === 'username_taken') serverErrors.value = { username: 'Taken' }
    else if (code === 'email_taken') serverErrors.value = { email: 'Taken' }
    else feedback.error('Profile not saved', cause)
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
    feedback.toast({ tone: 'success', title: 'Link sent', detail: `Check ${to}` })
  } catch (cause) {
    // Confirmed in another tab meanwhile: just show it.
    if (cause instanceof ApiRequestError && cause.code === 'already_verified') {
      session.emailConfirmed(to)
    } else feedback.error('Link not sent', cause)
  } finally {
    sending.value = false
  }
}

const removing = ref(false)

/** While email is paused: the one change left to an email set before. */
async function removeEmail() {
  const ok = await feedback.confirm({
    title: 'Remove email?',
    detail: 'It will no longer sign you in.',
    confirmLabel: 'Remove',
    tone: 'danger',
  })
  if (!ok) return
  removing.value = true
  try {
    await session.updateProfile({ email: null })
    feedback.toast({ tone: 'success', title: 'Email removed' })
  } catch (cause) {
    feedback.error('Email not removed', cause)
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
  <UiPanel title="Profile">
    <template v-if="session.me && !editing" #actions>
      <UiButton size="sm" variant="secondary" @click="startEdit">
        <Pencil class="size-4" aria-hidden="true" />
        Edit
      </UiButton>
    </template>

    <dl v-if="session.me && !editing" class="flex flex-col divide-y divide-border-subtle">
      <div
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <dt class="text-text-secondary">User ID</dt>
        <dd class="font-mono select-all">{{ session.me.id }}</dd>
      </div>
      <div
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <dt class="text-text-secondary">Username</dt>
        <dd class="min-w-0 truncate font-mono">{{ session.me.username }}</dd>
      </div>
      <div
        v-if="emailFeatures"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <dt class="text-text-secondary">Email</dt>
        <dd v-if="session.me.email" class="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span class="min-w-0 truncate">{{ session.me.email }}</span>
          <UiBadge
            :tone="session.me.emailVerified ? 'success' : 'warning'"
            :title="
              session.me.emailVerified ? 'Can receive password reset links' : 'Not confirmed yet'
            "
          >
            {{ session.me.emailVerified ? 'Verified' : 'Unverified' }}
          </UiBadge>
          <template v-if="!session.me.emailVerified">
            <UiButton
              v-if="session.me.emailEnabled"
              size="sm"
              :loading="sending"
              title="Mail a confirmation link (valid 24 hours)"
              @click="sendConfirmation"
            >
              Verify
            </UiButton>
            <span
              v-else
              class="text-sm text-text-muted"
              title="This server can't send email yet, so emails can't be confirmed and reset links can't be sent"
            >
              Email not available yet
            </span>
          </template>
        </dd>
        <dd
          v-else
          class="text-text-muted"
          title="Add and confirm an email to reset a lost password"
        >
          —
        </dd>
      </div>
      <div
        v-else-if="session.me.email"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
      >
        <dt class="text-text-secondary">Email</dt>
        <dd class="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span class="min-w-0 truncate" title="Also signs you in">{{ session.me.email }}</span>
          <UiButton size="sm" :loading="removing" @click="removeEmail"> Remove </UiButton>
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
      <UiField v-slot="{ id, describedBy }" label="Username" :error="show('username')">
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
        label="Email"
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
          Save
        </UiButton>
        <UiButton variant="ghost" :disabled="busy" @click="editing = false">Cancel</UiButton>
      </div>
    </form>
  </UiPanel>
</template>
