<script setup lang="ts">
import {
  OAUTH_PROVIDERS,
  type IdentitiesResponse,
  type IdentityResponse,
  type OAuthProvider,
} from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import { isProvider, oauthErrorText, providerLabel, providerNames } from '@/components/oauth/oauth'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError, api } from '@/api'
import { formatDateTime } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Discord / Google sign-in: Link (a round trip to the provider, back here)
 * and Unlink, which the server refuses while it is the only way in. Hidden
 * while the server has no provider and nothing is linked. While the email
 * features are paused there is no "forgot password", so a user with nothing
 * linked is nudged to link one.
 */
const session = useSession()
const feedback = useFeedback()
const route = useRoute()
const router = useRouter()

const data = ref<IdentitiesResponse | null>(null)
const busy = ref<OAuthProvider | null>(null)

const rows = computed(() =>
  OAUTH_PROVIDERS.filter(
    (provider) =>
      data.value?.providers.includes(provider) ||
      data.value?.identities.some((identity) => identity.provider === provider),
  ).map((provider) => ({
    provider,
    enabled: data.value?.providers.includes(provider) ?? false,
    identity: data.value?.identities.find((identity) => identity.provider === provider) ?? null,
  })),
)

/** Nothing linked and no email recovery: the providers to suggest, by name. */
const nudge = computed(() =>
  session.me?.emailFeatures === false && data.value?.identities.length === 0
    ? providerNames(data.value.providers)
    : '',
)

/** Unlinking must leave a way in: a password or another linked account. */
const canUnlink = computed(
  () => session.me?.hasPassword === true || (data.value?.identities.length ?? 0) > 1,
)

async function load() {
  try {
    data.value = await api.identities()
  } catch (cause) {
    feedback.error('Connected accounts not loaded', cause)
  }
}

onMounted(async () => {
  // Back from linking: say how it went once, then drop it from the URL.
  const { linked, oauth_error: problem } = route.query
  if (isProvider(linked)) {
    feedback.toast({ tone: 'success', title: `${providerLabel(linked)} linked` })
  } else if (typeof problem === 'string') {
    feedback.toast({ tone: 'danger', title: 'Not linked', detail: oauthErrorText(problem) })
  }
  if (linked !== undefined || problem !== undefined) {
    void router.replace({ query: { ...route.query, linked: undefined, oauth_error: undefined } })
  }
  await load()
})

async function link(provider: OAuthProvider) {
  busy.value = provider
  try {
    const { url } = await api.oauthLink(provider)
    window.location.assign(url)
  } catch (cause) {
    busy.value = null
    feedback.error(`Could not link ${providerLabel(provider)}`, cause)
  }
}

async function unlink(provider: OAuthProvider) {
  const label = providerLabel(provider)
  const ok = await feedback.confirm({
    title: `Unlink ${label}?`,
    detail: `This ${label} account will no longer sign in here. You can link it again later.`,
    confirmLabel: 'Unlink',
    tone: 'danger',
  })
  if (!ok) return
  busy.value = provider
  try {
    await api.unlinkIdentity(provider)
    feedback.toast({ tone: 'success', title: `${label} unlinked` })
  } catch (cause) {
    feedback.error(`${label} not unlinked`, cause)
  } finally {
    busy.value = null
    await load()
  }
}

/** The provider's email as the account's (only while it has none): confirmed by mail as usual. */
async function useEmail(identity: IdentityResponse) {
  if (!identity.email) return
  busy.value = identity.provider
  try {
    await session.updateProfile({ email: identity.email })
    feedback.toast({
      tone: 'success',
      title: 'Email set',
      detail: session.me?.emailEnabled ? `Confirmation sent to ${identity.email}` : undefined,
    })
  } catch (cause) {
    const taken = cause instanceof ApiRequestError && cause.code === 'email_taken'
    feedback.error('Email not set', taken ? new Error('It belongs to another account') : cause)
  } finally {
    busy.value = null
  }
}

function details(identity: IdentityResponse): string {
  const lines = [identity.email ?? '', `Linked ${formatDateTime(identity.createdAt)}`]
  if (identity.lastUsedAt) lines.push(`Last sign-in ${formatDateTime(identity.lastUsedAt)}`)
  return lines.filter(Boolean).join('\n')
}
</script>

<template>
  <UiPanel v-if="rows.length" title="Connected accounts">
    <p
      v-if="nudge"
      class="mb-3 text-sm text-text-muted"
      title="If you forget your password, sign in with it instead"
    >
      Link {{ nudge }} to keep a way in
    </p>
    <ul class="flex flex-col divide-y divide-border-subtle">
      <li
        v-for="row in rows"
        :key="row.provider"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
      >
        <div class="flex min-w-0 items-center gap-3">
          <ProviderMark :provider="row.provider" class="size-5 shrink-0" />
          <div class="min-w-0">
            <p class="font-medium">{{ providerLabel(row.provider) }}</p>
            <p
              v-if="row.identity"
              class="truncate text-sm text-text-muted"
              :title="details(row.identity)"
            >
              {{ row.identity.displayName ?? row.identity.email ?? 'Linked' }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="row.identity">
            <UiButton
              v-if="session.me?.emailFeatures && !session.me.email && row.identity.email"
              size="sm"
              variant="ghost"
              :disabled="busy !== null"
              :title="`Use ${row.identity.email} as your account email (confirmed by mail)`"
              @click="useEmail(row.identity)"
            >
              Use email
            </UiButton>
            <span :title="canUnlink ? undefined : 'Set a password or link another account first'">
              <UiButton
                size="sm"
                :loading="busy === row.provider"
                :disabled="busy !== null || !canUnlink"
                @click="unlink(row.provider)"
              >
                Unlink
              </UiButton>
            </span>
          </template>
          <UiButton
            v-else
            size="sm"
            :loading="busy === row.provider"
            :disabled="busy !== null || !row.enabled"
            :title="`Sign in with ${providerLabel(row.provider)} too`"
            @click="link(row.provider)"
          >
            Link
          </UiButton>
        </div>
      </li>
    </ul>
  </UiPanel>
</template>
