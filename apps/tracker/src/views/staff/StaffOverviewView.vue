<script setup lang="ts">
import gameData from '@gdt/game-data/data/meta.json'
import type { SignupMode, StaffSiteResponse } from '@gdt/shared'
import { computed, ref } from 'vue'
import LimitsDialog, { type LimitsPatch } from '@/components/staff/LimitsDialog.vue'
import MethodMarks from '@/components/staff/MethodMarks.vue'
import StackedBars from '@/components/staff/StackedBars.vue'
import UserLink from '@/components/staff/UserLink.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import { api } from '@/api'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Staff overview: totals, 30 days of sign-ups (by how they signed up) and
 * uploads, the newest sign-ups (a burst from one address stands out), and
 * the site's switches.
 */
const session = useSession()
const feedback = useFeedback()
const { data, error, reload } = useResource(
  () => true,
  () => api.staff.overview(),
)
const site = ref<StaffSiteResponse | null>(null)
const shownSite = computed(() => site.value ?? data.value?.site ?? null)

const SIGNUP_SERIES = [
  { key: 'password', label: 'Password', color: 'var(--chart-2)' },
  { key: 'discord', label: 'Discord', color: 'var(--chart-1)' },
  { key: 'google', label: 'Google', color: 'var(--chart-3)' },
]
const UPLOAD_SERIES = [{ key: 'stored', label: 'Stored', color: 'var(--chart-4)' }]

const MODES: { value: SignupMode; label: string; title: string }[] = [
  { value: 'open', label: 'Open', title: 'Anyone can sign up' },
  {
    value: 'oauth',
    label: 'Discord/Google only',
    title: 'New accounts only through Discord or Google',
  },
  { value: 'closed', label: 'Closed', title: 'Nobody can sign up; everyone can still sign in' },
]
const canSettings = computed(() => session.can('site.settings'))
const modeOptions = computed(() =>
  MODES.map((m) => ({
    ...m,
    disabled: !canSettings.value && m.value !== shownSite.value?.signupMode,
  })),
)
const saving = ref(false)

async function setMode(mode: SignupMode) {
  if (!canSettings.value || mode === shownSite.value?.signupMode) return
  saving.value = true
  try {
    site.value = await api.staff.updateSite({ signupMode: mode })
    feedback.toast({
      tone: 'success',
      title: `Sign-ups: ${MODES.find((m) => m.value === mode)!.label}`,
    })
  } catch (cause) {
    feedback.error('Not saved', cause)
  } finally {
    saving.value = false
  }
}
const signupMode = computed({
  get: () => shownSite.value?.signupMode ?? 'open',
  set: (mode: SignupMode) => void setMode(mode),
})

const limitsOpen = ref(false)
async function saveLimits(patch: LimitsPatch) {
  saving.value = true
  try {
    site.value = await api.staff.updateSite(patch)
    limitsOpen.value = false
    feedback.toast({ tone: 'success', title: 'Upload limits saved' })
  } catch (cause) {
    feedback.error('Not saved', cause)
  } finally {
    saving.value = false
  }
}

const storedShare = computed(() => {
  const bytes = data.value?.storedBytes ?? 0
  // D1's 10 GB.
  return `${((bytes / (10 * 1024 ** 3)) * 100).toFixed(1)}%`
})

const emailTone = (state: StaffSiteResponse['email']) =>
  state === 'on' ? 'success' : state === 'paused' ? 'warning' : 'neutral'
</script>

<template>
  <PageHeader title="Overview" />

  <UiError v-if="error && !data" :error="error" title="Could not load" @retry="reload" />

  <div v-else-if="!data" class="flex flex-col gap-6" aria-busy="true">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <UiSkeleton v-for="n in 6" :key="n" class="h-20" />
    </div>
    <UiSkeleton class="h-64" />
  </div>

  <div v-else class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <UiStat label="Users" :value="data.users.total">
        <span
          v-if="data.users.today"
          class="tabular font-mono text-sm text-success-text"
          title="Signed up today (UTC)"
          >+{{ formatNumber(data.users.today) }}</span
        >
      </UiStat>
      <UiStat
        label="Active 7 d"
        :value="data.active7d"
        hint="Seen in the last 7 days (an upload counts)"
      />
      <UiStat label="Accounts" :value="data.accounts" />
      <UiStat label="Snapshots" :value="data.snapshots.total">
        <span
          v-if="data.snapshots.today"
          class="tabular font-mono text-sm text-success-text"
          title="Stored today (UTC)"
          >+{{ formatNumber(data.snapshots.today) }}</span
        >
      </UiStat>
      <UiStat
        label="Stored"
        :value="formatBytes(data.storedBytes)"
        :hint="`${storedShare} of D1's 10 GB`"
      >
        <span class="tabular font-mono text-sm text-text-muted">{{ storedShare }}</span>
      </UiStat>
      <RouterLink
        v-if="session.can('users.view')"
        :to="{ name: 'staff-users', query: { filter: 'suspended' } }"
        class="flex rounded-xl transition-opacity hover:opacity-80"
        title="Suspended users"
      >
        <UiStat
          label="Suspended"
          :value="data.suspended"
          :tone="data.suspended ? 'warning' : undefined"
        />
      </RouterLink>
      <UiStat v-else label="Suspended" :value="data.suspended" />
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <UiPanel title="Sign-ups · 30 d">
        <StackedBars
          :days="data.signups"
          :series="SIGNUP_SERIES"
          label="Sign-ups per day for 30 days, by sign-in method"
        />
      </UiPanel>
      <UiPanel title="Uploads · 30 d">
        <StackedBars
          :days="data.uploads"
          :series="UPLOAD_SERIES"
          label="Snapshots stored per day for 30 days"
        />
      </UiPanel>
    </div>

    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <UiPanel v-if="data.recent" title="Recent sign-ups" flush>
        <template #actions>
          <UiButton
            variant="ghost"
            size="sm"
            :to="{ name: 'staff-users', query: { filter: 'new' } }"
          >
            All users
          </UiButton>
        </template>
        <ul class="divide-y divide-border-subtle text-sm">
          <li
            v-for="r in data.recent"
            :key="r.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5"
            :class="r.sameIp > 0 ? 'bg-amber-500/10' : ''"
          >
            <UserLink :user="r" class="min-w-0 basis-full sm:flex-1 sm:basis-0" />
            <MethodMarks :methods="[r.method]" />
            <span
              v-if="r.signupIp"
              class="truncate font-code text-[0.8125rem] text-text-secondary sm:w-32"
              >{{ r.signupIp }}</span
            >
            <UiBadge v-if="r.signupCountry" mono>{{ r.signupCountry }}</UiBadge>
            <span
              class="tabular text-text-muted sm:w-28 sm:text-right"
              :title="formatDateTime(r.createdAt)"
              >{{ formatRelative(r.createdAt) }}</span
            >
            <span class="tabular text-text-secondary sm:w-24 sm:text-right"
              >{{ formatNumber(r.accounts) }} {{ r.accounts === 1 ? 'account' : 'accounts' }}</span
            >
            <UiBadge
              v-if="r.sameIp > 0"
              tone="warning"
              title="Other sign-ups from this address within an hour"
              >+{{ r.sameIp }} same IP</UiBadge
            >
          </li>
        </ul>
      </UiPanel>

      <UiPanel v-if="shownSite" title="Site">
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-text-secondary">Sign-ups</span>
            <UiSegmented
              v-model="signupMode"
              :options="modeOptions"
              label="Sign-ups"
              class="self-start"
            />
          </div>
          <dl class="flex flex-col divide-y divide-border-subtle text-sm">
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Daily snapshots</dt>
              <dd class="tabular flex-1">
                {{ formatNumber(shownSite.limits.dailySnapshots) }} per user
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Daily storage</dt>
              <dd class="tabular flex-1">
                {{ formatBytes(shownSite.limits.dailyBytes) }} per user
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Storage quota</dt>
              <dd class="tabular flex-1">
                {{ formatBytes(shownSite.limits.storageQuota) }} per user
              </dd>
              <UiButton v-if="canSettings" variant="ghost" size="sm" @click="limitsOpen = true">
                Edit
              </UiButton>
            </div>
          </dl>
          <dl class="flex flex-col divide-y divide-border-subtle text-sm">
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Human check</dt>
              <dd>
                <UiBadge :tone="shownSite.humanCheck ? 'success' : 'neutral'">{{
                  shownSite.humanCheck ? 'On' : 'Off'
                }}</UiBadge>
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Discord</dt>
              <dd>
                <UiBadge :tone="shownSite.providers.discord ? 'success' : 'neutral'">{{
                  shownSite.providers.discord ? 'On' : 'Off'
                }}</UiBadge>
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Google</dt>
              <dd>
                <UiBadge :tone="shownSite.providers.google ? 'success' : 'neutral'">{{
                  shownSite.providers.google ? 'On' : 'Off'
                }}</UiBadge>
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Email</dt>
              <dd>
                <UiBadge :tone="emailTone(shownSite.email)" class="capitalize">{{
                  shownSite.email
                }}</UiBadge>
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Build</dt>
              <dd class="flex flex-wrap items-center gap-2">
                <span
                  v-if="shownSite.build"
                  class="font-code text-[0.8125rem]"
                  :title="shownSite.build.builtAt"
                  >{{ shownSite.build.commit.slice(0, 7) }}</span
                >
                <UiBadge
                  :tone="shownSite.migrations.pending.length ? 'warning' : 'neutral'"
                  :title="shownSite.migrations.pending.join(', ') || undefined"
                  >{{
                    shownSite.migrations.pending.length
                      ? `${shownSite.migrations.pending.length} migrations pending`
                      : 'Migrations ok'
                  }}</UiBadge
                >
              </dd>
            </div>
            <div class="flex items-center gap-3 py-2.5">
              <dt class="w-28 shrink-0 text-text-secondary sm:w-36">Game data</dt>
              <dd class="tabular" :title="gameData.version">
                v{{ gameData.version.split('+')[0] }}
              </dd>
            </div>
          </dl>
        </div>
      </UiPanel>
    </div>
  </div>

  <LimitsDialog
    :open="limitsOpen"
    :site="shownSite"
    :busy="saving"
    @close="limitsOpen = false"
    @confirm="saveLimits"
  />
</template>
