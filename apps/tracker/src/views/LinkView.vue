<script setup lang="ts">
import { callbackUrl, parseLinkQuery, type LinkQueryProblem } from '@gdt/shared'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleCheck, Monitor } from 'lucide-vue-next'
import LinkProblem from '@/components/public/LinkProblem.vue'
import type { LinkProblem as Problem } from '@/components/public/link-problem'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { api } from '@/api'
import { t } from '@/i18n'
import { errorText } from '@/i18n/api-errors'
import { useAccounts } from '@/stores/accounts'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

/**
 * `/link?client_id=irminsul&redirect_uri=…&state=…&code_challenge=…&device=…`:
 * irminsul's "Sign in with the tracker" (README "Sign in from irminsul").
 * The router has signed the user in first (back here with `?next=`). The
 * query is checked before anything shows; a bad link is an error card and is
 * never followed. Allow sends the browser to irminsul's loopback callback
 * with a one-time code; Cancel with `error=access_denied`.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const accounts = useAccounts()

const parsed = parseLinkQuery(route.query)
/** Inside someone else's frame, Allow could be clicked for the user: show nothing. */
const framed = window.top !== window.self

const problemText = (problem: LinkQueryProblem): string =>
  ({
    client: t('auth.link.problemClient'),
    redirect: t('auth.link.problemRedirect'),
    challenge: t('auth.link.problemCheck'),
    state: t('auth.link.problemCheck'),
  })[problem]

const problem = computed<Problem | null>(() => {
  if (framed) {
    return {
      kind: 'invalid',
      title: t('auth.linkProblem.invalidTitle'),
      text: t('auth.link.ownTab'),
    }
  }
  if (parsed.ok) return null
  return {
    kind: 'invalid',
    title: t('auth.linkProblem.invalidTitle'),
    text: t('auth.link.startAgain', { problem: problemText(parsed.problem) }),
  }
})

const device = computed(() => (parsed.ok && parsed.value.device) || t('auth.link.thisPc'))
/** Teyvat.me (irminsul's successor, same client id) adds `app=teyvatme`. */
const appOn = route.query.app === 'teyvatme' ? 'auth.link.teyvatmeOn' : 'auth.link.irminsulOn'
const choices = computed(() =>
  accounts.list
    .filter((account) => account.access !== 'viewer')
    .map((account) => ({ id: account.id, label: accounts.displayName(account) })),
)
const mode = ref<'uid' | 'account'>('uid')
const accountId = ref<number | null>(choices.value[0]?.id ?? null)
const busy = ref<'allow' | 'cancel' | null>(null)
const done = ref(false)
const error = ref('')

const ready = computed(
  () => busy.value === null && (mode.value === 'uid' || accountId.value !== null),
)

function go(url: string) {
  done.value = true
  window.location.assign(url)
}

async function allow() {
  if (!parsed.ok || !ready.value) return
  error.value = ''
  busy.value = 'allow'
  try {
    const { redirect } = await api.irminsulAuthorize({
      redirect_uri: parsed.value.redirectUri,
      state: parsed.value.state,
      code_challenge: parsed.value.codeChallenge,
      device: parsed.value.device,
      upload:
        mode.value === 'account' && accountId.value !== null
          ? { mode: 'account', account_id: accountId.value }
          : { mode: 'uid' },
    })
    go(redirect)
  } catch (cause) {
    error.value = errorText(cause, t('auth.link.notAllowed'))
  } finally {
    busy.value = null
  }
}

function cancel() {
  if (!parsed.ok) return
  busy.value = 'cancel'
  go(callbackUrl(parsed.value.redirectUri, { error: 'access_denied', state: parsed.value.state }))
}

/** "Not you?": sign out here and sign in as someone else, then back to this page. */
async function switchUser() {
  busy.value = 'cancel'
  try {
    await session.logout()
  } finally {
    accounts.clear()
    busy.value = null
    await router.replace({ name: 'login', query: { next: route.fullPath } })
  }
}
</script>

<template>
  <AuthFrame :title="problem ? problem.title : done ? $t('auth.link.done') : $t('auth.link.title')">
    <LinkProblem v-if="problem" :problem="problem" />

    <div v-else-if="done" class="flex flex-col items-center gap-6 text-center" role="status">
      <CircleCheck class="size-10 text-accent-text" aria-hidden="true" />
      <p class="text-gray-200">{{ $t('auth.link.closeTab') }}</p>
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="allow">
      <div
        class="flex items-center gap-3 rounded-xl border border-indigo-400/35 bg-indigo-500/10 p-3.5"
      >
        <Monitor class="size-6 shrink-0 text-accent-text" aria-hidden="true" />
        <div class="min-w-0">
          <p class="font-semibold break-words text-white">
            {{ $t(appOn, { device }) }}
          </p>
          <p class="text-sm text-gray-400">{{ $t('auth.link.wantsUpload') }}</p>
        </div>
      </div>

      <p
        v-if="error"
        class="rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-300"
        role="alert"
      >
        {{ error }}
      </p>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-2 text-sm font-medium text-gray-400">
          {{ $t('auth.link.uploadsGoTo') }}
        </legend>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
          :class="
            mode === 'uid' ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-white/10 bg-white/5'
          "
          :title="$t('auth.link.autoTitle')"
        >
          <input v-model="mode" type="radio" value="uid" class="size-4 accent-indigo-500" />
          <span class="text-gray-100">{{ $t('auth.link.auto') }}</span>
        </label>
        <div
          class="flex flex-col gap-3 rounded-xl border p-3 transition-colors"
          :class="[
            mode === 'account'
              ? 'border-indigo-400/60 bg-indigo-500/10'
              : 'border-white/10 bg-white/5',
            choices.length ? '' : 'opacity-60',
          ]"
          :title="choices.length ? $t('auth.link.alwaysTitle') : $t('auth.link.noAccounts')"
        >
          <label
            class="flex items-center gap-3"
            :class="choices.length ? 'cursor-pointer' : 'cursor-not-allowed'"
          >
            <input
              v-model="mode"
              type="radio"
              value="account"
              class="size-4 accent-indigo-500"
              :disabled="!choices.length"
            />
            <span class="text-gray-100">{{ $t('auth.link.always') }}</span>
          </label>
          <select
            v-if="choices.length"
            v-model="accountId"
            class="glass-input"
            :aria-label="$t('common.account')"
            @focus="mode = 'account'"
            @change="mode = 'account'"
          >
            <option v-for="choice in choices" :key="choice.id" :value="choice.id">
              {{ choice.label }}
            </option>
          </select>
        </div>
      </fieldset>

      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          class="btn-glass w-full rounded-xl"
          :disabled="busy !== null"
          @click="cancel"
        >
          {{ $t('common.cancel') }}
        </button>
        <button type="submit" class="btn-glow w-full rounded-xl" :disabled="!ready">
          <UiSpinner v-if="busy === 'allow'" class="size-4" />
          {{ $t('auth.link.allow') }}
        </button>
      </div>
    </form>

    <template v-if="!problem && !done" #footer>
      <i18n-t keypath="auth.link.signedInAs">
        <template #name>
          <span class="font-semibold text-gray-200">{{ session.me?.username }}</span>
        </template>
      </i18n-t>
      <button
        type="button"
        class="font-semibold text-accent-text hover:underline"
        :disabled="busy !== null"
        @click="switchUser"
      >
        {{ $t('auth.link.notYou') }}
      </button>
    </template>
  </AuthFrame>
</template>

<style scoped>
.glass-input option {
  background: rgb(15 23 42);
}
</style>
