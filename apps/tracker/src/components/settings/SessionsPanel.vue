<script setup lang="ts">
import type { SessionMethod, SessionResponse } from '@gdt/shared'
import { computed, onMounted, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { History, KeyRound, LifeBuoy, LogOut } from 'lucide-vue-next'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { ApiRequestError, api } from '@/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { describeUserAgent } from '@/lib/user-agent'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * The devices signed in to this account (each sign-in is one): where each
 * was last seen and when, with Sign out per device, for every other device,
 * and here. A device signed out elsewhere loses its live updates at once and
 * is signed out on its next request.
 */
const session = useSession()
const accounts = useAccounts()
const feedback = useFeedback()
const router = useRouter()

const sessions = ref<SessionResponse[] | null>(null)
/** The session being signed out, 'others', or 'here'. */
const busy = ref<number | 'others' | 'here' | null>(null)

/** How a session signed in: a tooltip, and an icon (Discord and Google show their marks). */
const METHODS: Record<SessionMethod, { title: string; icon?: Component }> = {
  password: { title: 'Signed in with a password', icon: KeyRound },
  discord: { title: 'Signed in with Discord' },
  google: { title: 'Signed in with Google' },
  reset: { title: 'Signed in with a reset link', icon: LifeBuoy },
  legacy: { title: 'Signed in before devices were listed', icon: History },
}

/** This device first, then the most recently seen. */
const rows = computed(() =>
  [...(sessions.value ?? [])]
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt - a.lastSeenAt)
    .map((row) => ({
      ...row,
      device: describeUserAgent(row.userAgent),
      place: [row.ip, [row.city, row.country].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · '),
    })),
)

async function load() {
  try {
    sessions.value = await api.sessions()
  } catch (cause) {
    feedback.error('Devices not loaded', cause)
  }
}

onMounted(load)

function details(row: SessionResponse): string {
  return [
    METHODS[row.method].title,
    `Since ${formatDateTime(row.createdAt)}`,
    `Last active ${formatDateTime(row.lastSeenAt)}`,
  ].join('\n')
}

async function signOutDevice(row: SessionResponse & { device: string }) {
  const ok = await feedback.confirm({
    title: `Sign out ${row.device}?`,
    detail: 'That device will have to sign in again.',
    confirmLabel: 'Sign out',
    tone: 'danger',
  })
  if (!ok) return
  busy.value = row.id
  try {
    await api.revokeSession(row.id)
    feedback.toast({ tone: 'success', title: 'Signed out', hint: row.device })
  } catch (cause) {
    // Gone already (it signed out, or ran out): the list catches up below.
    if (!(cause instanceof ApiRequestError && cause.status === 404)) {
      feedback.error('Not signed out', cause)
    }
  } finally {
    busy.value = null
    await load()
  }
}

async function signOutOthers() {
  const ok = await feedback.confirm({
    title: 'Sign out other devices?',
    detail: 'This device stays signed in.',
    confirmLabel: 'Sign out others',
    tone: 'danger',
  })
  if (!ok) return
  busy.value = 'others'
  try {
    await api.revokeOtherSessions()
    feedback.toast({ tone: 'success', title: 'Other devices signed out' })
  } catch (cause) {
    feedback.error('Other devices not signed out', cause)
  } finally {
    busy.value = null
    await load()
  }
}

async function signOut() {
  busy.value = 'here'
  try {
    await session.logout()
  } catch (error) {
    // The store has already forgotten the session; say the server did not hear it.
    feedback.error('Signed out here, but the server could not be reached', error)
  } finally {
    accounts.clear()
    busy.value = null
    await router.push({ name: 'login' })
  }
}
</script>

<template>
  <UiPanel title="Devices">
    <ul v-if="sessions" class="flex flex-col divide-y divide-border-subtle">
      <li
        v-for="row in rows"
        :key="row.id"
        class="flex items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="shrink-0 text-text-muted" :title="METHODS[row.method].title">
            <ProviderMark
              v-if="row.method === 'discord' || row.method === 'google'"
              :provider="row.method"
              class="size-4"
            />
            <component :is="METHODS[row.method].icon" v-else class="size-4" aria-hidden="true" />
            <span class="sr-only">{{ METHODS[row.method].title }}</span>
          </span>
          <div class="min-w-0" :title="details(row)">
            <p class="flex min-w-0 items-center gap-2">
              <span class="truncate font-medium" :title="row.userAgent ?? undefined">
                {{ row.device }}
              </span>
              <UiBadge v-if="row.current" tone="accent">This device</UiBadge>
            </p>
            <p class="truncate text-sm text-text-muted">
              <span class="tabular">{{ row.place || 'Unknown place' }}</span>
              <template v-if="!row.current"> · {{ formatRelative(row.lastSeenAt) }}</template>
            </p>
          </div>
        </div>
        <UiButton
          v-if="!row.current"
          size="sm"
          :loading="busy === row.id"
          :disabled="busy !== null"
          @click="signOutDevice(row)"
        >
          Sign out
        </UiButton>
      </li>
    </ul>
    <div v-else class="flex flex-col gap-3" aria-busy="true">
      <UiSkeleton v-for="n in 2" :key="n" class="h-10 w-full" />
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
      <UiButton
        :loading="busy === 'others'"
        :disabled="busy !== null"
        title="Every device but this one, including ones signed in before devices were listed"
        @click="signOutOthers"
      >
        Sign out other devices
      </UiButton>
      <UiButton :loading="busy === 'here'" :disabled="busy !== null" @click="signOut">
        <LogOut v-if="busy !== 'here'" class="size-4" aria-hidden="true" />
        Sign out
      </UiButton>
    </div>
  </UiPanel>
</template>
