<script setup lang="ts">
import {
  STORAGE_SORTS,
  STORAGE_WINDOWS,
  type StaffStorageRow,
  type StorageSort,
  type StorageWindow,
} from '@gdt/shared'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Flag, HardDrive, Search } from 'lucide-vue-next'
import ActionMenu, { type MenuItem } from '@/components/staff/ActionMenu.vue'
import QuotaDialog from '@/components/staff/QuotaDialog.vue'
import ReasonDialog from '@/components/staff/ReasonDialog.vue'
import UserLink from '@/components/staff/UserLink.vue'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPager from '@/components/ui/UiPager.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiStat from '@/components/ui/UiStat.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { api } from '@/api'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatNumber } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Who stores how much and how fast it grows (job: spot and stop storage
 * abuse). A row opens the user; Block uploads and the quota are here too,
 * as the caller's nodes allow.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const feedback = useFeedback()

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback

const windowChoice = ref<StorageWindow>(pick(route.query.window, STORAGE_WINDOWS, '24h'))
const sort = ref<StorageSort>(pick(route.query.sort, STORAGE_SORTS, 'growth'))
const flagged = ref(route.query.flagged === '1')
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = refDebounced(q, 300)
const page = ref(Math.max(1, Number(route.query.page) || 1))

watch([windowChoice, sort, flagged, query], () => (page.value = 1))
watch([windowChoice, sort, flagged, query, page], () => {
  void router.replace({
    query: {
      ...(windowChoice.value !== '24h' ? { window: windowChoice.value } : {}),
      ...(sort.value !== 'growth' ? { sort: sort.value } : {}),
      ...(flagged.value ? { flagged: '1' } : {}),
      ...(query.value ? { q: query.value } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
    },
  })
})

const { data, error, loading, reload } = useResource(
  () => ({
    window: windowChoice.value,
    sort: sort.value,
    flagged: flagged.value,
    q: query.value.trim(),
    page: page.value,
  }),
  (params) => api.staff.storage(params),
)

const WINDOWS = [
  { value: '24h' as const, label: '24 h' },
  { value: '7d' as const, label: '7 d' },
  { value: '30d' as const, label: '30 d' },
]
const windowLabel = computed(() => WINDOWS.find((w) => w.value === windowChoice.value)!.label)
const SORTS = [
  { value: 'growth' as const, label: 'Growth' },
  { value: 'stored' as const, label: 'Stored' },
  { value: 'quota' as const, label: 'Quota used' },
  { value: 'snapshots' as const, label: 'Snapshots' },
]

const FLAG_TEXT = {
  near_quota: (row: StaffStorageRow) => ({
    label: 'Near quota',
    title: `${Math.round((row.storedBytes / Math.max(1, row.quota)) * 100)}% of ${formatBytes(row.quota)}`,
  }),
  daily_cap: (row: StaffStorageRow) => ({
    label:
      row.dailyCapDays && row.dailyCapDays > 1 ? `Daily cap ×${row.dailyCapDays}` : 'Daily cap',
    title: `Reached the daily upload cap on ${row.dailyCapDays} of the last 7 days`,
  }),
  account_limit: (row: StaffStorageRow) => ({
    label: `${row.accounts} accounts`,
    title: 'At the number of accounts a user key makes',
  }),
}

const share = (row: StaffStorageRow) =>
  Math.min(100, (row.storedBytes / Math.max(1, row.quota)) * 100)

// ------------------------------------------------------------------- actions

const canManage = computed(() => session.can('data.manage'))
const blockFor = ref<StaffStorageRow | null>(null)
const quotaFor = ref<StaffStorageRow | null>(null)
const busy = ref(false)

async function act(work: () => Promise<unknown>, done: string) {
  busy.value = true
  try {
    await work()
    feedback.toast({ tone: 'success', title: done })
    blockFor.value = null
    quotaFor.value = null
    await reload()
  } catch (cause) {
    feedback.error('Not changed', cause)
  } finally {
    busy.value = false
  }
}

const unblock = (row: StaffStorageRow) =>
  act(() => api.staff.setUploads(row.id, false), 'Uploads unblocked')

function block(reason: string) {
  const row = blockFor.value
  if (row) void act(() => api.staff.setUploads(row.id, true, reason), 'Uploads blocked')
}

function saveQuota(bytes: number | null) {
  const row = quotaFor.value
  if (row) void act(() => api.staff.setQuota(row.id, bytes), 'Quota saved')
}

function menu(row: StaffStorageRow): MenuItem[] {
  const items: MenuItem[] = []
  if (canManage.value) items.push({ label: 'Storage quota…', run: () => (quotaFor.value = row) })
  if (session.can('users.view')) {
    items.push({
      label: 'Open user',
      run: () => void router.push({ name: 'staff-user', params: { userId: row.id } }),
    })
  }
  return items
}

const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1,
)
</script>

<template>
  <PageHeader title="Storage" />

  <div class="flex flex-col gap-4">
    <UiToolbar label="Filter storage">
      <div class="flex flex-wrap items-center gap-2">
        <UiSegmented v-model="windowChoice" :options="WINDOWS" label="Window" />
        <FilterChip
          :pressed="flagged"
          :count="data?.flagged"
          title="Near the quota, at a daily cap, or at the account limit"
          @toggle="flagged = !flagged"
        >
          <Flag class="size-4" aria-hidden="true" />
          Flagged
        </FilterChip>
        <label class="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput v-model="q" type="search" class="pl-9" placeholder="User or UID" />
        </label>
        <label class="w-full sm:w-40">
          <span class="sr-only">Sort</span>
          <UiSelect v-model="sort" :options="SORTS" />
        </label>
      </div>
    </UiToolbar>

    <UiError v-if="error && !data" :error="error" title="Could not load" @retry="reload" />

    <div v-else-if="!data" class="flex flex-col gap-4" aria-busy="true">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <UiSkeleton v-for="n in 4" :key="n" class="h-20" />
      </div>
      <UiSkeleton v-for="n in 6" :key="n" class="h-12" />
    </div>

    <template v-else>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <UiStat
          label="Stored"
          :value="formatBytes(data.totals.storedBytes)"
          :hint="`${((data.totals.storedBytes / (10 * 1024 ** 3)) * 100).toFixed(1)}% of D1's 10 GB`"
        />
        <UiStat :label="`New · ${windowLabel}`" :value="formatBytes(data.totals.newBytes)" />
        <UiStat :label="`Snapshots · ${windowLabel}`" :value="data.totals.newSnapshots" />
        <UiStat
          label="Near quota"
          :value="data.totals.nearQuota"
          :tone="data.totals.nearQuota ? 'warning' : undefined"
          hint="At 80% of their quota or more"
        />
      </div>

      <UiPanel v-if="data.rows.length === 0" flush>
        <UiEmpty :title="flagged ? 'Nobody flagged' : 'Nothing stored'">
          <template #icon><HardDrive aria-hidden="true" /></template>
        </UiEmpty>
      </UiPanel>

      <div
        v-else
        class="overflow-x-auto rounded-xl border border-border-default bg-surface-raised shadow-sm"
        :aria-busy="loading"
      >
        <table class="w-full min-w-[62rem] text-sm">
          <thead class="border-b border-border-default bg-surface-overlay/50 text-text-secondary">
            <tr>
              <th scope="col" class="px-3 py-2 text-left font-medium">User</th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Accounts</th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Snapshots</th>
              <th
                scope="col"
                class="px-3 py-2 text-right font-medium"
                :class="sort === 'growth' ? 'text-text-primary' : ''"
              >
                New · {{ windowLabel }}
              </th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Stored</th>
              <th scope="col" class="w-40 px-3 py-2 text-left font-medium">Quota</th>
              <th
                scope="col"
                class="px-3 py-2 text-right font-medium"
                title="Size of the GOOD files as uploaded"
              >
                Raw
              </th>
              <th scope="col" class="px-3 py-2 text-right font-medium">Trash</th>
              <th scope="col" class="px-3 py-2 text-left font-medium">Flags</th>
              <th scope="col" class="px-3 py-2"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-subtle">
            <tr v-for="row in data.rows" :key="row.id" class="hover:bg-surface-overlay/60">
              <td class="max-w-56 px-3 py-1.5"><UserLink :user="row" /></td>
              <td class="tabular px-3 py-1.5 text-right font-mono">
                {{ formatNumber(row.accounts) }}
              </td>
              <td class="tabular px-3 py-1.5 text-right font-mono">
                {{ formatNumber(row.snapshots) }}
              </td>
              <td
                class="tabular px-3 py-1.5 text-right font-mono font-semibold"
                :title="`${formatBytes(row.newBytes)} newly stored`"
              >
                +{{ formatNumber(row.newSnapshots) }}
              </td>
              <td class="tabular px-3 py-1.5 text-right font-mono">
                {{ formatBytes(row.storedBytes) }}
              </td>
              <td class="px-3 py-1.5">
                <span class="flex items-center gap-2" :title="`of ${formatBytes(row.quota)}`">
                  <UiProgress
                    class="flex-1"
                    :value="row.storedBytes"
                    :max="row.quota"
                    :tone="share(row) >= 80 ? 'danger' : 'accent'"
                    :label="`${row.username}'s quota used`"
                  />
                  <span class="tabular w-10 text-right text-[0.8125rem] text-text-secondary"
                    >{{ Math.round(share(row)) }}%</span
                  >
                </span>
              </td>
              <td class="tabular px-3 py-1.5 text-right font-mono text-text-secondary">
                {{ formatBytes(row.rawBytes) }}
              </td>
              <td class="tabular px-3 py-1.5 text-right font-mono text-text-secondary">
                {{ formatNumber(row.trash) }}
              </td>
              <td class="px-3 py-1.5">
                <span class="flex flex-wrap gap-1">
                  <UiBadge v-if="row.suspended" tone="danger">Suspended</UiBadge>
                  <UiBadge v-else-if="row.uploadsBlocked" tone="warning">Blocked</UiBadge>
                  <UiBadge
                    v-for="flag in row.flags"
                    :key="flag"
                    tone="warning"
                    :title="FLAG_TEXT[flag](row).title"
                    >{{ FLAG_TEXT[flag](row).label }}</UiBadge
                  >
                </span>
              </td>
              <td class="px-2 py-1 text-right whitespace-nowrap">
                <span class="inline-flex items-center gap-1">
                  <template v-if="canManage">
                    <UiButton
                      v-if="row.uploadsBlocked"
                      variant="ghost"
                      size="sm"
                      :disabled="busy"
                      @click="unblock(row)"
                    >
                      Unblock
                    </UiButton>
                    <UiButton v-else variant="ghost" size="sm" @click="blockFor = row">
                      Block
                    </UiButton>
                  </template>
                  <ActionMenu :label="`More for ${row.username}`" :items="menu(row)" />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <UiPager
        v-model="page"
        :page-count="pageCount"
        :total="data.total"
        :page-size="data.pageSize"
      />
    </template>
  </div>

  <ReasonDialog
    :open="blockFor !== null"
    title="Block uploads"
    :user="blockFor"
    :effects="[
      'Refuses every upload, from Irminsul and the website',
      'They can still sign in and look',
      'Keeps their data',
    ]"
    confirm-label="Block uploads"
    :busy="busy"
    @close="blockFor = null"
    @confirm="block"
  />
  <QuotaDialog
    :open="quotaFor !== null"
    :quota="quotaFor?.ownQuota ?? null"
    :default-quota="data?.defaultQuota ?? 0"
    :busy="busy"
    @close="quotaFor = null"
    @confirm="saveQuota"
  />
</template>
