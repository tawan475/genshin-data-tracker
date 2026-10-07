<script setup lang="ts">
import { ACCOUNT_SETTINGS_DEFAULTS, type InspectView, type StaffInspectResponse } from '@gdt/shared'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiError from '@/components/ui/UiError.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import { api } from '@/api'
import { travelerGender } from '@/data/traveler'
import { loadGameIcons, setTravelerGender } from '@/lib/assets'
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useSession } from '@/stores/session'
import { provideAccount } from '@/views/account/context'

/**
 * Someone's account through staff eyes: the owner's own Characters,
 * Weapons, Artifacts, Materials and Snapshots pages, read-only (nothing is
 * saved, their settings are not read), with a banner saying whose it is.
 * Every page opened is written to the audit log (the server does it).
 */
const route = useRoute()
const router = useRouter()
const session = useSession()

const accountId = computed(() => Number(route.params.accountId))
const view = computed(() => (route.meta.inspect ?? 'characters') as InspectView)
const opened = shallowRef<StaffInspectResponse | null>(null)
const error = shallowRef<unknown>(null)

async function open(id: number, page: InspectView) {
  error.value = null
  try {
    const result = await api.staff.inspect(id, page)
    if (id === accountId.value) opened.value = result
  } catch (cause) {
    if (id === accountId.value) error.value = cause
  }
}

// Logged on every page opened, as the plan asks (the data reads log too).
watch([accountId, view], ([id, page]) => void open(id, page), { immediate: true })

// Portraits: the default Traveler (the owner's choice is in their settings).
travelerGender.value = ACCOUNT_SETTINGS_DEFAULTS.traveler
setTravelerGender(ACCOUNT_SETTINGS_DEFAULTS.traveler)
loadGameIcons().catch(() => {})

const account = computed(() =>
  opened.value && opened.value.account.id === accountId.value
    ? { ...opened.value.account, source: 'staff' as const }
    : null,
)

provideAccount(
  computed(() => account.value!),
  {
    readOnly: true,
    purge: session.can('data.delete')
      ? async (ids) => (await api.staff.purge(accountId.value, { kind: 'snapshots', ids })).deleted
      : undefined,
    reload: async () => {
      await open(accountId.value, view.value)
      return account.value ?? undefined
    },
    route: (name) => (name.startsWith('account-') ? `staff-inspect-${name.slice(8)}` : name),
  },
)

const TABS: { value: InspectView; label: string }[] = [
  { value: 'characters', label: 'Characters' },
  { value: 'weapons', label: 'Weapons' },
  { value: 'artifacts', label: 'Artifacts' },
  { value: 'materials', label: 'Materials' },
  { value: 'snapshots', label: 'Snapshots' },
]
const tab = computed({
  get: () => view.value,
  set: (value: InspectView) =>
    void router.push({ name: `staff-inspect-${value}`, params: { accountId: accountId.value } }),
})

const latest = computed(() => account.value?.latest ?? null)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
      role="note"
    >
      <span class="min-w-0 flex-1">
        <template v-if="opened">
          <span class="font-semibold">{{ opened.owner.username }}</span>
          <span class="text-text-secondary">
            · {{ opened.account.name || 'Account' }}
            <template v-if="opened.account.uid">
              · UID <span class="tabular font-mono">{{ opened.account.uid }}</span>
            </template>
          </span>
        </template>
        <span v-else class="text-text-secondary">Loading…</span>
      </span>
      <UiBadge title="Staff can't change anything here">Read-only</UiBadge>
      <UiBadge title="Every page opened here is written to the audit log">Logged</UiBadge>
      <UiButton
        v-if="opened"
        variant="ghost"
        size="sm"
        :to="{ name: 'staff-user', params: { userId: opened.owner.id } }"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
        Back to user
      </UiButton>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div class="scroll-hide scroll-fade-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <UiSegmented v-model="tab" :options="TABS" label="Data" size="md" />
      </div>
      <span
        v-if="latest"
        class="ml-auto text-sm text-text-muted"
        :title="formatDateTime(latest.lastSeenAt)"
        >Snapshot · {{ formatRelative(latest.lastSeenAt) }} ·
        {{ formatNumber(account?.snapshotCount ?? 0) }} in all</span
      >
    </div>

    <UiError
      v-if="error && !account"
      :error="error"
      title="Could not open"
      @retry="open(accountId, view)"
    />
    <div v-else-if="!account" class="flex flex-col gap-4" aria-busy="true">
      <UiSkeleton class="h-28" />
      <UiSkeleton class="h-64" />
    </div>
    <div v-else>
      <RouterView />
    </div>
  </div>
</template>
