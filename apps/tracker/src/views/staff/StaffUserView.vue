<script setup lang="ts">
import { OAUTH_PROVIDERS, type StaffAccountRow, type StaffUserDetailResponse } from '@gdt/shared'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Ban,
  Eye,
  Link2,
  LogOut,
  Monitor,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Unlink,
  X,
} from 'lucide-vue-next'
import ProviderMark from '@/components/oauth/ProviderMark.vue'
import { providerLabel } from '@/components/oauth/oauth'
import ActionMenu, { type MenuItem } from '@/components/staff/ActionMenu.vue'
import DeleteDataDialog from '@/components/staff/DeleteDataDialog.vue'
import DeleteUserDialog from '@/components/staff/DeleteUserDialog.vue'
import QuotaDialog from '@/components/staff/QuotaDialog.vue'
import ReasonDialog from '@/components/staff/ReasonDialog.vue'
import RenameDialog from '@/components/staff/RenameDialog.vue'
import ResetLinkDialog from '@/components/staff/ResetLinkDialog.vue'
import RoleBadge from '@/components/staff/RoleBadge.vue'
import { auditPhrase, userStatus } from '@/components/staff/status'
import { serverName } from '@/components/user/servers'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { ApiRequestError, api, type PurgeBody } from '@/api'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { describeUserAgent } from '@/lib/user-agent'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import { useStaff } from '@/stores/staff'

/**
 * One user, for staff: who they are and how they sign in, their Genshin
 * accounts (Inspect, keys, quota, deleting data), their sessions, and what
 * staff did to them. Actions show only for the caller's nodes, and only on
 * users below the caller's highest role.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const feedback = useFeedback()
const staffStore = useStaff()

const userId = computed(() => Number(route.params.userId))
const { data, error, reload } = useResource(
  () => userId.value,
  (id) => api.staff.user(id),
)
const detail = computed<StaffUserDetailResponse | undefined>(() =>
  data.value?.user.id === userId.value ? data.value : undefined,
)
const user = computed(() => detail.value?.user)
/** The user as dialogs name them. */
const target = computed(() =>
  user.value ? { id: user.value.id, username: user.value.username } : null,
)
const status = computed(() => (user.value ? userStatus(user.value) : null))

/** A node the caller holds, on a user they outrank. */
const may = (node: Parameters<typeof session.can>[0]) =>
  session.can(node) && detail.value?.outranked === true

const busy = ref(false)

/** Runs an action, says how it went, and reloads the page's data. */
async function act(work: () => Promise<unknown>, done: string, failed: string): Promise<boolean> {
  busy.value = true
  try {
    await work()
    feedback.toast({ tone: 'success', title: done })
    await reload()
    return true
  } catch (cause) {
    feedback.error(failed, cause)
    return false
  } finally {
    busy.value = false
  }
}

// --------------------------------------------------------------------- dialogs

const resetOpen = ref(false)
const suspendOpen = ref(false)
const blockOpen = ref(false)
const renameOpen = ref(false)
const renameError = ref('')
const deleteOpen = ref(false)
const quotaOpen = ref(false)
const dataAccount = ref<StaffAccountRow | null>(null)

async function suspend(reason: string) {
  if (await act(() => api.staff.suspend(userId.value, reason), 'Suspended', 'Not suspended')) {
    suspendOpen.value = false
  }
}

async function unsuspend() {
  await act(() => api.staff.unsuspend(userId.value), 'Suspension lifted', 'Not changed')
}

async function rename(username: string) {
  renameError.value = ''
  busy.value = true
  try {
    await api.staff.rename(userId.value, username)
    renameOpen.value = false
    feedback.toast({ tone: 'success', title: `Renamed to ${username}` })
    await reload()
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'username_taken') {
      renameError.value = 'Taken'
    } else feedback.error('Not renamed', cause)
  } finally {
    busy.value = false
  }
}

async function remove(username: string) {
  busy.value = true
  try {
    await api.staff.deleteUser(userId.value, username)
    feedback.toast({ tone: 'success', title: `Deleted ${username}` })
    deleteOpen.value = false
    await router.replace({ name: 'staff-users' })
  } catch (cause) {
    feedback.error('Not deleted', cause)
  } finally {
    busy.value = false
  }
}

async function signOutAll() {
  await act(() => api.staff.signOut(userId.value), 'Signed out everywhere', 'Not signed out')
}

async function signOutSession(id: number) {
  await act(() => api.staff.signOutSession(userId.value, id), 'Signed out', 'Not signed out')
}

async function setUploads(blocked: boolean, reason = '') {
  if (
    await act(
      () => api.staff.setUploads(userId.value, blocked, reason),
      blocked ? 'Uploads blocked' : 'Uploads unblocked',
      'Not changed',
    )
  ) {
    blockOpen.value = false
  }
}

async function setQuota(bytes: number | null) {
  if (await act(() => api.staff.setQuota(userId.value, bytes), 'Quota saved', 'Not saved')) {
    quotaOpen.value = false
  }
}

async function unlink(provider: string) {
  const ok = await feedback.confirm({
    title: `Unlink ${providerLabel(provider as never)}`,
    detail: `${user.value?.username} can no longer sign in with it (they can link it again).`,
    confirmLabel: 'Unlink',
    tone: 'danger',
  })
  if (ok) await act(() => api.staff.unlink(userId.value, provider), 'Unlinked', 'Not unlinked')
}

async function revokeUserKey() {
  const ok = await feedback.confirm({
    title: 'Revoke the all-accounts key',
    detail: 'Irminsul stops uploading with it at once; they can make a new one in Settings.',
    confirmLabel: 'Revoke',
    tone: 'danger',
  })
  if (ok) await act(() => api.staff.revokeUserKey(userId.value), 'Key revoked', 'Not revoked')
}

async function resetAccountKey(account: StaffAccountRow) {
  const ok = await feedback.confirm({
    title: 'Reset import key',
    detail: `The key of ${account.name || `UID ${account.uid}`} stops working at once; they make a new one in Manage.`,
    confirmLabel: 'Reset key',
    tone: 'danger',
  })
  if (ok) await act(() => api.staff.resetAccountKey(account.id), 'Key reset', 'Not reset')
}

async function purge(body: PurgeBody) {
  const account = dataAccount.value
  if (!account) return
  busy.value = true
  try {
    const { deleted } = await api.staff.purge(account.id, body)
    feedback.toast({
      tone: 'success',
      title: `Deleted ${formatNumber(deleted)} ${deleted === 1 ? 'snapshot' : 'snapshots'}`,
    })
    dataAccount.value = null
    await reload()
  } catch (cause) {
    feedback.error('Not deleted', cause)
  } finally {
    busy.value = false
  }
}

async function deleteAccount() {
  const account = dataAccount.value
  if (!account) return
  if (await act(() => api.staff.deleteAccount(account.id), 'Account deleted', 'Not deleted')) {
    dataAccount.value = null
  }
}

// ----------------------------------------------------------------------- roles

const roleAnchor = ref<HTMLElement | null>(null)
const roleOpen = ref(false)
const addable = computed(() => {
  const held = new Set(user.value?.roles.map((r) => r.id) ?? [])
  return (detail.value?.assignable ?? []).filter((r) => !held.has(r.id))
})
const removable = (roleId: number) => detail.value?.assignable.some((r) => r.id === roleId) ?? false

async function addRole(roleId: number) {
  roleOpen.value = false
  await act(() => api.staff.addRole(userId.value, roleId), 'Role given', 'Not given')
}

async function removeRole(roleId: number) {
  await act(() => api.staff.removeRole(userId.value, roleId), 'Role taken away', 'Not changed')
  // The caller may have changed their own standing (never: they can't act on themselves).
  void staffStore.reload()
}

// -------------------------------------------------------------------- accounts

const showAll = ref(false)
const ACCOUNTS_SHOWN = 4
const accounts = computed(() => {
  const list = detail.value?.accounts ?? []
  return showAll.value ? list : list.slice(0, ACCOUNTS_SHOWN)
})

function accountMenu(account: StaffAccountRow): MenuItem[] {
  const items: MenuItem[] = []
  if (may('data.manage')) {
    items.push(
      user.value?.uploadsBlockedAt
        ? { label: 'Unblock uploads', run: () => void setUploads(false) }
        : { label: 'Block uploads…', run: () => (blockOpen.value = true) },
      { label: 'Storage quota…', run: () => (quotaOpen.value = true) },
      { label: 'Reset import key', run: () => void resetAccountKey(account) },
    )
  }
  if (may('data.delete')) {
    items.push({ label: 'Delete data…', danger: true, run: () => (dataAccount.value = account) })
  }
  return items
}

// ------------------------------------------------------------------------ usage

const usage = computed(() => detail.value?.usage ?? null)
const quotaShare = computed(() =>
  usage.value ? Math.min(1, usage.value.storedBytes / Math.max(1, usage.value.storageQuota)) : 0,
)
const capHit = computed(
  () =>
    !!usage.value &&
    (usage.value.daySnapshots >= usage.value.dailySnapshots ||
      usage.value.dayBytes >= usage.value.dailyBytes),
)

const isPhone = (userAgent: string | null) => /\b(?:iPhone|Android|Mobile)\b/.test(userAgent ?? '')
const METHODS: Record<string, string> = {
  password: 'Password',
  discord: 'Discord',
  google: 'Google',
  reset: 'Reset link',
  legacy: 'Before sessions',
}

const identities = computed(() =>
  OAUTH_PROVIDERS.map((provider) => ({
    provider,
    identity: detail.value?.identities?.find((i) => i.provider === provider) ?? null,
  })),
)
</script>

<template>
  <PageHeader :title="user?.username ?? 'User'" />

  <RouterLink
    :to="{ name: 'staff-users' }"
    class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
  >
    <ArrowLeft class="size-4" aria-hidden="true" />
    Users
  </RouterLink>

  <UiError v-if="error && !detail" :error="error" title="Could not load the user" @retry="reload" />

  <div v-else-if="!detail || !user" class="flex flex-col gap-6" aria-busy="true">
    <UiSkeleton class="h-16 w-80" />
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <UiSkeleton v-for="n in 4" :key="n" class="h-20" />
    </div>
    <UiSkeleton class="h-64" />
  </div>

  <div v-else class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span
        class="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-xl font-semibold text-text-secondary"
        aria-hidden="true"
        >{{ user.username.charAt(0).toUpperCase() }}</span
      >
      <div class="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="truncate text-2xl font-semibold">{{ user.username }}</h2>
          <span class="tabular font-mono text-text-muted">#{{ user.id }}</span>
          <UiBadge v-if="status" :tone="status.tone">{{ status.label }}</UiBadge>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="text-text-muted">Roles</span>
          <span v-if="user.roles.length === 0" class="text-text-muted">—</span>
          <RoleBadge v-for="role in user.roles" :key="role.id" :role="role">
            <button
              v-if="removable(role.id)"
              type="button"
              class="-mr-1 rounded hover:text-danger-text"
              :aria-label="`Take ${role.name} away`"
              :title="`Take ${role.name} away`"
              :disabled="busy"
              @click="removeRole(role.id)"
            >
              <X class="size-3.5" aria-hidden="true" />
            </button>
          </RoleBadge>
          <span v-if="addable.length" ref="roleAnchor" class="inline-flex">
            <UiButton variant="ghost" size="sm" class="min-h-7 px-2" @click="roleOpen = !roleOpen">
              <Plus class="size-4" aria-hidden="true" />
              Role
            </UiButton>
            <UiPopover
              :open="roleOpen"
              :anchor="roleAnchor"
              label="Give a role"
              :focus="false"
              @close="roleOpen = false"
            >
              <div class="flex flex-col p-1.5">
                <button
                  v-for="role in addable"
                  :key="role.id"
                  type="button"
                  class="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left font-medium text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
                  @click="addRole(role.id)"
                >
                  <span class="size-2.5 rounded-full" :style="{ backgroundColor: role.color }" />
                  {{ role.name }}
                </button>
              </div>
            </UiPopover>
          </span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton v-if="may('users.reset_password')" @click="resetOpen = true">
          <Link2 class="size-4" aria-hidden="true" />
          Reset link
        </UiButton>
        <UiButton v-if="may('users.sessions')" :disabled="busy" @click="signOutAll">
          <LogOut class="size-4" aria-hidden="true" />
          Sign out all
        </UiButton>
        <template v-if="may('users.manage')">
          <UiButton :disabled="busy" @click="renameOpen = true">
            <Pencil class="size-4" aria-hidden="true" />
            Rename
          </UiButton>
          <UiButton v-if="user.suspendedAt" :disabled="busy" @click="unsuspend">
            <Ban class="size-4" aria-hidden="true" />
            Unsuspend
          </UiButton>
          <UiButton v-else :disabled="busy" @click="suspendOpen = true">
            <Ban class="size-4" aria-hidden="true" />
            Suspend
          </UiButton>
        </template>
        <UiButton v-if="may('users.delete')" variant="danger" @click="deleteOpen = true">
          <Trash2 class="size-4" aria-hidden="true" />
          Delete user
        </UiButton>
      </div>
    </div>

    <p
      v-if="user.suspendedAt"
      class="rounded-xl border border-danger-border bg-danger-surface px-4 py-3 text-sm text-danger-text"
      role="note"
    >
      Suspended {{ formatRelative(user.suspendedAt)
      }}<template v-if="user.suspendedReason"> · “{{ user.suspendedReason }}”</template>
    </p>

    <div class="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-3">
      <UiStat
        label="Joined"
        :value="formatDate(user.createdAt)"
        :hint="formatDateTime(user.createdAt)"
      >
        <span v-if="user.signupIp || user.signupCountry" class="text-sm text-text-muted">
          <span v-if="user.signupIp" class="font-code text-[0.8125rem]">{{ user.signupIp }}</span>
          {{ user.signupIp && user.signupCountry ? '·' : '' }} {{ user.signupCountry }}
        </span>
      </UiStat>
      <UiStat
        label="Last active"
        :value="user.lastActiveAt ? formatRelative(user.lastActiveAt) : '—'"
        :hint="user.lastActiveAt ? formatDateTime(user.lastActiveAt) : undefined"
      />
      <UiStat
        label="Storage"
        :value="usage ? formatBytes(usage.storedBytes) : formatBytes(user.storedBytes)"
      >
        <template v-if="usage">
          <span class="text-sm text-text-muted"
            >of {{ formatBytes(usage.storageQuota)
            }}{{ usage.quota !== null ? ' (own quota)' : '' }}</span
          >
          <UiProgress
            class="mt-1"
            :value="usage.storedBytes"
            :max="usage.storageQuota"
            :tone="quotaShare >= 0.8 ? 'danger' : 'accent'"
            label="Storage used"
          />
        </template>
      </UiStat>
      <UiStat
        v-if="usage"
        label="Today"
        :value="`${formatNumber(usage.daySnapshots)} / ${formatNumber(usage.dailySnapshots)}`"
        :hint="`${formatBytes(usage.dayBytes)} of ${formatBytes(usage.dailyBytes)} stored today (UTC)`"
      >
        <span v-if="capHit" class="text-sm text-warning-text">Daily cap hit</span>
      </UiStat>
    </div>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-6">
        <UiPanel flush>
          <template #header>
            <h2 class="text-base font-semibold">Genshin accounts</h2>
            <span class="tabular font-mono text-sm text-text-muted">{{
              formatNumber(detail.accounts.length)
            }}</span>
          </template>
          <p v-if="detail.accounts.length === 0" class="px-5 py-6 text-sm text-text-muted">None</p>
          <div v-else class="overflow-x-auto">
            <table class="w-full min-w-[34rem] text-sm">
              <thead
                class="border-b border-border-default bg-surface-overlay/50 text-text-secondary"
              >
                <tr>
                  <th scope="col" class="px-4 py-2 text-left font-medium">Name</th>
                  <th scope="col" class="px-3 py-2 text-left font-medium">UID</th>
                  <th scope="col" class="px-3 py-2 text-left font-medium">Server</th>
                  <th scope="col" class="px-3 py-2 text-right font-medium">Snapshots</th>
                  <th scope="col" class="px-3 py-2 text-left font-medium">Last upload</th>
                  <th scope="col" class="px-3 py-2 text-right font-medium">Stored</th>
                  <th scope="col" class="px-3 py-2"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <tr v-for="account in accounts" :key="account.id">
                  <td class="max-w-48 truncate px-4 py-1.5 font-medium">
                    {{ account.name || '—' }}
                  </td>
                  <td class="tabular px-3 py-1.5 font-mono text-text-secondary">
                    {{ account.uid ?? '—' }}
                  </td>
                  <td class="px-3 py-1.5 text-text-secondary">
                    {{ serverName(account.server) || '—' }}
                  </td>
                  <td
                    class="tabular px-3 py-1.5 text-right font-mono"
                    :title="
                      account.trash ? `${formatNumber(account.trash)} in the trash` : undefined
                    "
                  >
                    {{ formatNumber(account.snapshotCount) }}
                  </td>
                  <td
                    class="tabular px-3 py-1.5 whitespace-nowrap text-text-secondary"
                    :title="account.lastUploadAt ? formatDateTime(account.lastUploadAt) : undefined"
                  >
                    {{ account.lastUploadAt ? formatRelative(account.lastUploadAt) : '—' }}
                  </td>
                  <td class="tabular px-3 py-1.5 text-right font-mono">
                    {{ formatBytes(account.storedBytes) }}
                  </td>
                  <td class="px-2 py-1 text-right whitespace-nowrap">
                    <span class="inline-flex items-center gap-1">
                      <UiButton
                        v-if="may('data.inspect')"
                        variant="ghost"
                        size="sm"
                        :to="{
                          name: 'staff-inspect-characters',
                          params: { accountId: account.id },
                        }"
                      >
                        <Eye class="size-4" aria-hidden="true" />
                        Inspect
                      </UiButton>
                      <ActionMenu
                        :label="`More for ${account.name || account.uid || 'this account'}`"
                        :items="accountMenu(account)"
                      />
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div
            v-if="detail.accounts.length > ACCOUNTS_SHOWN"
            class="border-t border-border-default px-5 py-3"
          >
            <button
              type="button"
              class="text-sm font-medium text-accent-text hover:underline"
              @click="showAll = !showAll"
            >
              {{
                showAll
                  ? 'Show fewer'
                  : `Show ${formatNumber(detail.accounts.length - ACCOUNTS_SHOWN)} more`
              }}
            </button>
          </div>
        </UiPanel>

        <UiPanel v-if="detail.sessions" title="Sessions" flush>
          <template v-if="may('users.sessions') && detail.sessions.length" #actions>
            <UiButton variant="ghost" size="sm" :disabled="busy" @click="signOutAll">
              Sign out all
            </UiButton>
          </template>
          <p v-if="detail.sessions.length === 0" class="px-5 py-6 text-sm text-text-muted">
            Signed in nowhere
          </p>
          <ul v-else class="divide-y divide-border-subtle text-sm">
            <li
              v-for="s in detail.sessions"
              :key="s.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5"
            >
              <component
                :is="isPhone(s.userAgent) ? Smartphone : Monitor"
                class="size-5 shrink-0 text-text-secondary"
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="font-medium">{{ describeUserAgent(s.userAgent) }}</span>
                <span class="text-[0.8125rem] text-text-muted">
                  <span class="font-code">{{ s.ip ?? '—' }}</span>
                  · {{ [s.city, s.country].filter(Boolean).join(', ') || '—' }} ·
                  {{ METHODS[s.method] ?? s.method }}
                </span>
              </span>
              <span class="tabular text-text-secondary" :title="formatDateTime(s.lastSeenAt)">{{
                formatRelative(s.lastSeenAt)
              }}</span>
              <UiButton
                v-if="may('users.sessions')"
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="signOutSession(s.id)"
              >
                Sign out
              </UiButton>
            </li>
          </ul>
        </UiPanel>
      </div>

      <div class="flex min-w-0 flex-col gap-6">
        <UiPanel title="Sign-in" flush>
          <dl class="divide-y divide-border-subtle px-5 text-sm">
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-24 shrink-0 text-text-secondary">Password</dt>
              <dd class="flex-1">{{ user.hasPassword ? 'Set' : '—' }}</dd>
            </div>
            <div v-if="user.email !== undefined" class="flex items-center gap-3 py-2.5">
              <dt class="w-24 shrink-0 text-text-secondary">Email</dt>
              <dd class="min-w-0 flex-1 truncate" :class="user.email ? '' : 'text-text-muted'">
                {{ user.email ?? '—' }}
                <UiBadge v-if="user.email && user.emailVerified" tone="success" class="ml-1"
                  >Confirmed</UiBadge
                >
              </dd>
            </div>
            <template v-if="detail.identities">
              <div
                v-for="row in identities"
                :key="row.provider"
                class="flex items-center gap-3 py-2.5"
              >
                <dt class="flex w-24 shrink-0 items-center gap-1.5 text-text-secondary">
                  <ProviderMark :provider="row.provider" class="size-3.5" />
                  {{ providerLabel(row.provider) }}
                </dt>
                <dd v-if="row.identity" class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                  <span class="truncate font-medium">{{
                    row.identity.displayName ?? row.identity.email ?? 'Linked'
                  }}</span>
                  <span
                    class="text-[0.8125rem] text-text-muted"
                    :title="`Linked ${formatDateTime(row.identity.createdAt)}`"
                    >{{
                      row.identity.lastUsedAt
                        ? `used ${formatRelative(row.identity.lastUsedAt)}`
                        : 'never used'
                    }}</span
                  >
                </dd>
                <dd v-else class="flex-1 text-text-muted">—</dd>
                <UiButton
                  v-if="row.identity && may('users.identities')"
                  variant="ghost"
                  size="sm"
                  :disabled="busy"
                  @click="unlink(row.provider)"
                >
                  <Unlink class="size-4" aria-hidden="true" />
                  Unlink
                </UiButton>
              </div>
            </template>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-24 shrink-0 text-text-secondary" title="Irminsul key for all accounts">
                User key
              </dt>
              <dd class="flex-1" :class="user.hasImportKey ? '' : 'text-text-muted'">
                {{ user.hasImportKey ? 'Set' : '—' }}
              </dd>
              <UiButton
                v-if="user.hasImportKey && may('data.manage')"
                variant="ghost"
                size="sm"
                :disabled="busy"
                @click="revokeUserKey"
              >
                Revoke
              </UiButton>
            </div>
          </dl>
        </UiPanel>

        <UiPanel v-if="detail.history" title="Staff history" flush>
          <template #actions>
            <UiButton
              variant="ghost"
              size="sm"
              :to="{ name: 'staff-audit', query: { user: String(user.id) } }"
            >
              All
            </UiButton>
          </template>
          <p v-if="detail.history.length === 0" class="px-5 py-6 text-sm text-text-muted">None</p>
          <ul v-else class="divide-y divide-border-subtle text-sm">
            <li v-for="h in detail.history" :key="h.id" class="flex items-start gap-3 px-5 py-2.5">
              <span class="tabular w-24 shrink-0 text-text-muted" :title="formatDateTime(h.at)">{{
                formatRelative(h.at)
              }}</span>
              <span class="flex min-w-0 flex-col gap-0.5">
                <span class="text-text-secondary">
                  <span class="font-medium text-text-primary">{{ h.actor.label }}</span>
                  {{ auditPhrase(h.action, h.detail) }}
                </span>
                <span
                  v-if="typeof h.detail.reason === 'string' && h.detail.reason"
                  class="text-[0.8125rem] text-text-muted"
                  >“{{ h.detail.reason }}”</span
                >
              </span>
            </li>
          </ul>
        </UiPanel>
      </div>
    </div>
  </div>

  <ResetLinkDialog
    :open="resetOpen"
    :user="target"
    :identities="detail?.identities"
    @close="resetOpen = false"
  />
  <ReasonDialog
    :open="suspendOpen"
    title="Suspend"
    :user="target"
    :effects="['Signs them out everywhere', 'Blocks sign-in and uploads', 'Keeps their data']"
    confirm-label="Suspend"
    :busy="busy"
    @close="suspendOpen = false"
    @confirm="suspend"
  />
  <ReasonDialog
    :open="blockOpen"
    title="Block uploads"
    :user="target"
    :effects="[
      'Refuses every upload, from Irminsul and the website',
      'They can still sign in and look',
      'Keeps their data',
    ]"
    confirm-label="Block uploads"
    :busy="busy"
    @close="blockOpen = false"
    @confirm="(reason) => setUploads(true, reason)"
  />
  <RenameDialog
    :open="renameOpen"
    :user="target"
    :busy="busy"
    :error="renameError"
    @close="renameOpen = false"
    @confirm="rename"
  />
  <DeleteUserDialog
    :open="deleteOpen"
    :user="target"
    :figures="
      user
        ? { accounts: user.accounts, snapshots: user.snapshots, storedBytes: user.storedBytes }
        : undefined
    "
    :busy="busy"
    @close="deleteOpen = false"
    @confirm="remove"
  />
  <QuotaDialog
    :open="quotaOpen"
    :quota="usage?.quota ?? null"
    :default-quota="usage?.siteQuota ?? 0"
    :busy="busy"
    @close="quotaOpen = false"
    @confirm="setQuota"
  />
  <DeleteDataDialog
    :open="dataAccount !== null"
    :account="dataAccount"
    :busy="busy"
    @close="dataAccount = null"
    @purge="purge"
    @delete-account="deleteAccount"
  />
</template>
