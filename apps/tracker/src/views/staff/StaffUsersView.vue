<script setup lang="ts">
import {
  STAFF_BULK_MAX,
  STAFF_USER_FILTERS,
  STAFF_USER_SORTS,
  type StaffUserFilter,
  type StaffUserRow,
  type StaffUserSort,
} from '@gdt/shared'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Ban, Search, SearchX, Trash2 } from 'lucide-vue-next'
import SortHeader from '@/components/characters/SortHeader.vue'
import ConfirmDialog from '@/components/snapshot-history/ConfirmDialog.vue'
import LegacyCheckbox from '@/components/snapshot-history/LegacyCheckbox.vue'
import MethodMarks from '@/components/staff/MethodMarks.vue'
import ReasonDialog from '@/components/staff/ReasonDialog.vue'
import RoleBadge from '@/components/staff/RoleBadge.vue'
import UserLink from '@/components/staff/UserLink.vue'
import { userStatus } from '@/components/staff/status'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPager from '@/components/ui/UiPager.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { api } from '@/api'
import { useSnapshotSelection } from '@/composables/useSnapshotSelection'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Every user: search (name, UID, #id; email, IP and Discord / Google names
 * with users.view_private), filter chips with counts, sortable columns,
 * and bulk Suspend / Delete for what the caller's nodes allow. The state is
 * in the URL, so links (the overview's "Suspended") land filtered.
 */
const route = useRoute()
const router = useRouter()
const session = useSession()
const feedback = useFeedback()

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = refDebounced(q, 300)
const filter = ref<StaffUserFilter>(pick(route.query.filter, STAFF_USER_FILTERS, 'all'))
const sort = ref<StaffUserSort>(pick(route.query.sort, STAFF_USER_SORTS, 'joined'))
const direction = ref<'asc' | 'desc'>(route.query.dir === 'asc' ? 'asc' : 'desc')
const page = ref(Math.max(1, Number(route.query.page) || 1))

watch([query, filter, sort, direction], () => (page.value = 1))
watch([query, filter, sort, direction, page], () => {
  void router.replace({
    query: {
      ...(query.value ? { q: query.value } : {}),
      ...(filter.value !== 'all' ? { filter: filter.value } : {}),
      ...(sort.value !== 'joined' ? { sort: sort.value } : {}),
      ...(direction.value !== 'desc' ? { dir: direction.value } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
    },
  })
})

const { data, error, loading, reload } = useResource(
  () => ({
    q: query.value.trim(),
    filter: filter.value,
    sort: sort.value,
    dir: direction.value,
    page: page.value,
  }),
  (params) => api.staff.users(params),
)
const rows = computed<StaffUserRow[]>(() => data.value?.users ?? [])

const CHIPS: { value: StaffUserFilter; label: string; title: string }[] = [
  { value: 'all', label: 'All', title: 'Every user' },
  { value: 'new', label: 'New 7 d', title: 'Joined in the last 7 days' },
  { value: 'active', label: 'Active', title: 'Seen in the last 7 days' },
  { value: 'none', label: 'No uploads', title: 'No snapshot yet' },
  { value: 'suspended', label: 'Suspended', title: 'Suspended users' },
  { value: 'staff', label: 'Staff', title: 'Users with a staff role' },
]

/** Newest first by default; the select offers the common orders. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'joined:desc', label: 'Newest' },
  { value: 'joined:asc', label: 'Oldest' },
  { value: 'active:desc', label: 'Last active' },
  { value: 'storage:desc', label: 'Storage' },
  { value: 'snapshots:desc', label: 'Snapshots' },
  { value: 'name:asc', label: 'Name' },
]
const sortChoice = computed({
  get: () => `${sort.value}:${direction.value}`,
  set: (value: string) => {
    const [key, dir] = value.split(':')
    sort.value = pick(key, STAFF_USER_SORTS, 'joined')
    direction.value = dir === 'asc' ? 'asc' : 'desc'
  },
})
const sortOptions = computed(() =>
  SORT_OPTIONS.some((o) => o.value === sortChoice.value)
    ? SORT_OPTIONS
    : [...SORT_OPTIONS, { value: sortChoice.value, label: 'Column' }],
)

/** Natural first direction per column. */
const NATURAL: Record<StaffUserSort, 'asc' | 'desc'> = {
  joined: 'desc',
  active: 'desc',
  name: 'asc',
  accounts: 'desc',
  snapshots: 'desc',
  storage: 'desc',
}
function sortBy(key: StaffUserSort) {
  if (sort.value === key) direction.value = direction.value === 'desc' ? 'asc' : 'desc'
  else {
    sort.value = key
    direction.value = NATURAL[key]
  }
}
const ariaSort = (key: StaffUserSort) =>
  sort.value !== key ? undefined : direction.value === 'asc' ? 'ascending' : 'descending'

// ------------------------------------------------------------------ selection

const canSuspend = computed(() => session.can('users.manage'))
const canDelete = computed(() => session.can('users.delete'))
const selectable = computed(() => canSuspend.value || canDelete.value)
const { selectedCount, isSelected, toggle, coverage, toggleView, resetSelection, selected } =
  useSnapshotSelection(rows)
const pageCoverage = computed(() => coverage(rows.value))
const tooMany = computed(() => selectedCount.value > STAFF_BULK_MAX)
/** The users this page knows by id (for names in dialogs). */
const known = new Map<number, StaffUserRow>()
watch(rows, (list) => list.forEach((u) => known.set(u.id, u)), { immediate: true })

const suspendOpen = ref(false)
const busy = ref(false)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)

async function runBulk(action: 'suspend' | 'delete', reason = '') {
  const ids = [...selected.value]
  busy.value = true
  try {
    const result = await api.staff.bulk(
      action === 'delete' ? { action, ids, confirm: 'DELETE' } : { action, ids, reason },
    )
    feedback.toast({
      tone: 'success',
      title: `${action === 'delete' ? 'Deleted' : 'Suspended'} ${formatNumber(result.done)} ${result.done === 1 ? 'user' : 'users'}`,
      detail: result.skipped.length
        ? `${formatNumber(result.skipped.length)} skipped: roles as high as yours`
        : undefined,
    })
    resetSelection()
    suspendOpen.value = false
    await reload()
  } catch (cause) {
    feedback.error(action === 'delete' ? 'Not deleted' : 'Not suspended', cause)
  } finally {
    busy.value = false
  }
}

async function bulkDelete() {
  const ok = await confirmDialog.value?.ask({
    title: `Delete ${formatNumber(selectedCount.value)} users`,
    text: 'Their accounts, snapshots and sign-ins go with them. This cannot be undone.',
    confirmText: 'Delete users',
    expect: 'DELETE',
  })
  if (ok) await runBulk('delete')
}

const selectedNames = computed(() =>
  [...selected.value].map((id) => known.get(id)?.username ?? `#${id}`),
)

const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1,
)
</script>

<template>
  <PageHeader title="Users" />

  <div class="flex flex-col gap-4">
    <UiToolbar label="Filter users">
      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput
            v-model="q"
            type="search"
            class="pl-9"
            :placeholder="
              session.can('users.view_private')
                ? 'Name, email, UID, id, IP, Discord or Google'
                : 'Name, UID or id'
            "
            autocomplete="off"
          />
        </label>
        <label class="w-full sm:w-44">
          <span class="sr-only">Sort</span>
          <UiSelect v-model="sortChoice" :options="sortOptions" />
        </label>
      </div>
      <div
        class="scroll-hide scroll-fade-x -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:scroll-fade-none sm:flex-wrap sm:overflow-visible sm:px-0"
        role="radiogroup"
        aria-label="Show"
      >
        <FilterChip
          v-for="chip in CHIPS"
          :key="chip.value"
          radio
          :pressed="filter === chip.value"
          :count="data?.counts[chip.value]"
          :title="chip.title"
          @toggle="filter = chip.value"
        >
          {{ chip.label }}
        </FilterChip>
        <span
          v-if="data"
          class="tabular ml-auto shrink-0 pl-2 font-mono text-sm text-text-secondary"
          :title="`${formatNumber(data.total)} shown of ${formatNumber(data.counts.all)} users`"
          >{{ formatNumber(data.total) }} / {{ formatNumber(data.counts.all) }}</span
        >
      </div>
    </UiToolbar>

    <div
      v-if="selectedCount > 0"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-default bg-accent/10 px-4 py-2.5 text-sm"
      role="status"
    >
      <span class="font-semibold">{{ formatNumber(selectedCount) }} selected</span>
      <span v-if="tooMany" class="text-warning-text"
        >At most {{ formatNumber(STAFF_BULK_MAX) }} at once</span
      >
      <span class="ml-auto flex flex-wrap gap-2">
        <UiButton
          v-if="canSuspend"
          size="sm"
          :disabled="tooMany || busy"
          @click="suspendOpen = true"
        >
          <Ban class="size-4" aria-hidden="true" />
          Suspend
        </UiButton>
        <UiButton
          v-if="canDelete"
          variant="danger"
          size="sm"
          :disabled="tooMany || busy"
          @click="bulkDelete"
        >
          <Trash2 class="size-4" aria-hidden="true" />
          Delete
        </UiButton>
        <UiButton variant="ghost" size="sm" @click="resetSelection">Clear</UiButton>
      </span>
    </div>

    <UiError v-if="error && !data" :error="error" title="Could not load users" @retry="reload" />

    <div v-else-if="!data" class="flex flex-col gap-2" aria-busy="true">
      <UiSkeleton v-for="n in 8" :key="n" class="h-12" />
    </div>

    <UiPanel v-else-if="rows.length === 0" flush>
      <UiEmpty title="No users match">
        <template #icon><SearchX aria-hidden="true" /></template>
      </UiEmpty>
    </UiPanel>

    <div
      v-else
      class="overflow-x-auto rounded-xl border border-border-default bg-surface-raised shadow-sm"
      :aria-busy="loading"
    >
      <table class="w-full min-w-[56rem] text-sm">
        <thead class="border-b border-border-default bg-surface-overlay/50 text-text-secondary">
          <tr>
            <th v-if="selectable" scope="col" class="w-10 px-2 py-2">
              <LegacyCheckbox
                class="size-8"
                :checked="pageCoverage === 'all'"
                :mixed="pageCoverage === 'some'"
                label="Select this page"
                @toggle="toggleView(rows)"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-left" :aria-sort="ariaSort('name')">
              <SortHeader
                label="User"
                :active="sort === 'name'"
                :direction="direction"
                @sort="sortBy('name')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Sign-in</th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Roles</th>
            <th scope="col" class="px-3 py-2 text-right" :aria-sort="ariaSort('accounts')">
              <SortHeader
                label="Accounts"
                :active="sort === 'accounts'"
                :direction="direction"
                @sort="sortBy('accounts')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-right" :aria-sort="ariaSort('snapshots')">
              <SortHeader
                label="Snapshots"
                :active="sort === 'snapshots'"
                :direction="direction"
                @sort="sortBy('snapshots')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-right" :aria-sort="ariaSort('storage')">
              <SortHeader
                label="Storage"
                :active="sort === 'storage'"
                :direction="direction"
                @sort="sortBy('storage')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-left" :aria-sort="ariaSort('joined')">
              <SortHeader
                label="Joined"
                :active="sort === 'joined'"
                :direction="direction"
                @sort="sortBy('joined')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-left" :aria-sort="ariaSort('active')">
              <SortHeader
                label="Last active"
                :active="sort === 'active'"
                :direction="direction"
                @sort="sortBy('active')"
              />
            </th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          <tr
            v-for="user in rows"
            :key="user.id"
            class="transition-colors hover:bg-surface-overlay/60"
            :class="isSelected(user.id) ? 'bg-accent/10' : ''"
          >
            <td v-if="selectable" class="px-2 py-1.5">
              <LegacyCheckbox
                class="size-8"
                :checked="isSelected(user.id)"
                :label="`Select ${user.username}`"
                title="Shift-click to select a range"
                @toggle="(event) => toggle(user.id, rows, event.shiftKey)"
              />
            </td>
            <td class="max-w-64 px-3 py-1.5"><UserLink :user="user" /></td>
            <td class="px-3 py-1.5"><MethodMarks :methods="user.methods" /></td>
            <td class="px-3 py-1.5">
              <span class="flex flex-wrap gap-1">
                <RoleBadge v-for="role in user.roles" :key="role.id" :role="role" />
              </span>
            </td>
            <td class="tabular px-3 py-1.5 text-right font-mono">
              {{ formatNumber(user.accounts) }}
            </td>
            <td class="tabular px-3 py-1.5 text-right font-mono">
              {{ formatNumber(user.snapshots) }}
            </td>
            <td class="tabular px-3 py-1.5 text-right font-mono">
              {{ formatBytes(user.storedBytes) }}
            </td>
            <td
              class="tabular px-3 py-1.5 whitespace-nowrap text-text-secondary"
              :title="
                [formatDateTime(user.createdAt), user.signupIp, user.signupCountry]
                  .filter(Boolean)
                  .join(' · ')
              "
            >
              {{
                Date.now() - user.createdAt < 7 * 86_400_000
                  ? formatRelative(user.createdAt)
                  : formatDate(user.createdAt)
              }}
            </td>
            <td
              class="tabular px-3 py-1.5 whitespace-nowrap text-text-secondary"
              :title="user.lastActiveAt ? formatDateTime(user.lastActiveAt) : undefined"
            >
              {{ user.lastActiveAt ? formatRelative(user.lastActiveAt) : '—' }}
            </td>
            <td class="px-3 py-1.5">
              <UiBadge v-if="userStatus(user)" :tone="userStatus(user)!.tone">{{
                userStatus(user)!.label
              }}</UiBadge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UiPager
      v-if="data"
      v-model="page"
      :page-count="pageCount"
      :total="data.total"
      :page-size="data.pageSize"
    />
  </div>

  <ReasonDialog
    :open="suspendOpen"
    :title="`Suspend ${formatNumber(selectedCount)} ${selectedCount === 1 ? 'user' : 'users'}`"
    :user="null"
    :effects="[
      selectedNames.slice(0, 5).join(', ') + (selectedNames.length > 5 ? '…' : ''),
      'Signs them out everywhere',
      'Blocks sign-in and uploads',
      'Keeps their data',
    ]"
    confirm-label="Suspend"
    :busy="busy"
    @close="suspendOpen = false"
    @confirm="(reason) => runBulk('suspend', reason)"
  />
  <ConfirmDialog ref="confirmDialog" />
</template>
