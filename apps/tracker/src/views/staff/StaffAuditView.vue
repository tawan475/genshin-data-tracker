<script setup lang="ts">
import { AUDIT_KINDS, type AuditKind, type AuditRow } from '@gdt/shared'
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ScrollText, Search, X } from 'lucide-vue-next'
import type { BadgeTone } from '@/components/staff/status'
import FilterChip from '@/components/ui/FilterChip.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPager from '@/components/ui/UiPager.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSelect from '@/components/ui/UiSelect.vue'
import UiSkeleton from '@/components/ui/UiSkeleton.vue'
import UiToolbar from '@/components/ui/UiToolbar.vue'
import { api } from '@/api'
import { useResource } from '@/data/use-resource'
import { formatBytes, formatDateTime, formatFullDateTime, sameDay } from '@/lib/format'

/** What staff did, newest first: every dashboard write and every look at someone's data. */
const route = useRoute()
const router = useRouter()

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = refDebounced(q, 300)
const actor = ref<number | null>(Number(route.query.actor) || null)
const kind = ref<AuditKind | null>(
  (AUDIT_KINDS as readonly string[]).includes(String(route.query.kind))
    ? (route.query.kind as AuditKind)
    : null,
)
const user = ref<number | null>(Number(route.query.user) || null)
const page = ref(Math.max(1, Number(route.query.page) || 1))

watch([query, actor, kind, user], () => (page.value = 1))
watch([query, actor, kind, user, page], () => {
  void router.replace({
    query: {
      ...(query.value ? { q: query.value } : {}),
      ...(actor.value ? { actor: String(actor.value) } : {}),
      ...(kind.value ? { kind: kind.value } : {}),
      ...(user.value ? { user: String(user.value) } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
    },
  })
})

const { data, error, loading, reload } = useResource(
  () => ({
    q: query.value.trim(),
    actor: actor.value ?? undefined,
    kind: kind.value ?? undefined,
    user: user.value ?? undefined,
    page: page.value,
  }),
  (params) => api.staff.audit(params),
)

const actorOptions = computed(() => [
  { value: null, label: 'All staff' },
  ...(data.value?.actors ?? []).map((a) => ({ value: a.id, label: a.label })),
])
const KIND_OPTIONS: { value: AuditKind | null; label: string }[] = [
  { value: null, label: 'All actions' },
  { value: 'views', label: 'Views of data' },
  { value: 'deletes', label: 'Deletes' },
  { value: 'users', label: 'Users' },
  { value: 'data', label: 'Data' },
  { value: 'roles', label: 'Roles' },
  { value: 'site', label: 'Site' },
]

function tone(action: string): BadgeTone {
  if (/delete/.test(action) || action === 'user.suspend') return 'danger'
  if (action === 'data.block_uploads' || action.startsWith('site.')) return 'warning'
  if (action.startsWith('role.')) return 'accent'
  return 'neutral'
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

/** The row's detail in a few words. */
function describe(row: AuditRow): string {
  const d = row.detail
  const parts: string[] = []
  switch (row.action) {
    case 'user.rename':
      parts.push(`${str(d.from)} → ${str(d.to)}`)
      break
    case 'data.inspect':
    case 'data.reset_key':
    case 'data.delete_account':
      parts.push([str(d.account), str(d.view)].filter(Boolean).join(' · '))
      if (row.action === 'data.reset_key' && d.key === 'user') parts.push('all-accounts key')
      break
    case 'data.delete': {
      const range =
        d.kind === 'range' && typeof d.from === 'number' && typeof d.to === 'number'
          ? ` · ${new Date(d.from).toLocaleDateString()}–${new Date(d.to - 1).toLocaleDateString()}`
          : d.kind === 'trash'
            ? ' · trash'
            : ''
      parts.push(
        `${typeof d.snapshots === 'number' ? d.snapshots : '?'} snapshots, ${str(d.account)}${range}`,
      )
      break
    }
    case 'data.quota':
      parts.push(typeof d.bytes === 'number' ? formatBytes(d.bytes) : 'Default')
      break
    case 'user.unlink':
      parts.push(str(d.provider))
      break
    case 'user.sessions':
      parts.push(d.all ? 'Every device' : 'One device')
      break
    case 'role.assign':
    case 'role.unassign':
    case 'role.delete':
      parts.push(str(d.role))
      break
    case 'role.create':
    case 'role.update': {
      const added = Array.isArray(d.added)
        ? d.added
        : Array.isArray(d.permissions)
          ? d.permissions
          : []
      const removed = Array.isArray(d.removed) ? d.removed : []
      parts.push(
        [
          str(d.from) ? `${str(d.from)} → ${str(d.role)}` : str(d.role),
          ...added.map((n) => `+ ${String(n)}`),
          ...removed.map((n) => `− ${String(n)}`),
        ].join(' '),
      )
      break
    }
    case 'role.reorder':
      parts.push(Array.isArray(d.order) ? d.order.join(' › ') : '')
      break
    case 'site.signups':
      parts.push(`${str(d.from)} → ${str(d.to)}`)
      break
    case 'site.limits':
      parts.push(
        Object.entries(d)
          .map(([k, v]) => `${k} ${v === null ? 'default' : String(v)}`)
          .join(', '),
      )
      break
  }
  if (str(d.reason)) parts.push(`“${str(d.reason)}”`)
  if (typeof d.bulk === 'number') parts.push(`bulk of ${d.bulk}`)
  return parts.filter(Boolean).join(' · ')
}

const when = (ms: number) =>
  sameDay(ms, Date.now())
    ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : formatDateTime(ms)

const pageCount = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.pageSize)) : 1,
)
</script>

<template>
  <PageHeader title="Audit" />

  <div class="flex flex-col gap-4">
    <UiToolbar label="Filter audit log">
      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 basis-full sm:basis-0 sm:flex-1">
          <span class="sr-only">Search</span>
          <Search
            class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <UiInput v-model="q" type="search" class="pl-9" placeholder="User, staff or detail" />
        </label>
        <label class="min-w-0 flex-1 sm:w-44 sm:flex-none">
          <span class="sr-only">Staff</span>
          <UiSelect v-model="actor" :options="actorOptions" />
        </label>
        <label class="min-w-0 flex-1 sm:w-44 sm:flex-none">
          <span class="sr-only">Action</span>
          <UiSelect v-model="kind" :options="KIND_OPTIONS" />
        </label>
      </div>
      <div v-if="user" class="flex flex-wrap gap-2">
        <FilterChip pressed title="Show every user" @toggle="user = null">
          User #{{ user }}
          <X class="size-4" aria-hidden="true" />
        </FilterChip>
      </div>
    </UiToolbar>

    <UiError v-if="error && !data" :error="error" title="Could not load" @retry="reload" />

    <div v-else-if="!data" class="flex flex-col gap-2" aria-busy="true">
      <UiSkeleton v-for="n in 8" :key="n" class="h-11" />
    </div>

    <UiPanel v-else-if="data.rows.length === 0" flush>
      <UiEmpty title="Nothing logged">
        <template #icon><ScrollText aria-hidden="true" /></template>
      </UiEmpty>
    </UiPanel>

    <div
      v-else
      class="overflow-x-auto rounded-xl border border-border-default bg-surface-raised shadow-sm"
      :aria-busy="loading"
    >
      <table class="w-full min-w-[54rem] text-sm">
        <thead class="border-b border-border-default bg-surface-overlay/50 text-text-secondary">
          <tr>
            <th scope="col" class="px-3 py-2 text-left font-medium">When</th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Staff</th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Action</th>
            <th scope="col" class="px-3 py-2 text-left font-medium">User</th>
            <th scope="col" class="px-3 py-2 text-left font-medium">Detail</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-subtle">
          <tr v-for="row in data.rows" :key="row.id">
            <td
              class="tabular px-3 py-2 whitespace-nowrap text-text-secondary"
              :title="formatFullDateTime(row.at)"
            >
              {{ when(row.at) }}
            </td>
            <td class="px-3 py-2">
              <span class="inline-flex items-center gap-1.5 font-medium">
                <span
                  class="size-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: row.actor.color ?? 'var(--text-muted)' }"
                />
                {{ row.actor.label }}
              </span>
            </td>
            <td class="px-3 py-2">
              <UiBadge mono :tone="tone(row.action)">{{ row.action }}</UiBadge>
            </td>
            <td class="px-3 py-2">
              <RouterLink
                v-if="row.target.id"
                :to="{ name: 'staff-user', params: { userId: row.target.id } }"
                class="font-medium text-accent-text hover:underline"
                >{{ row.target.label ?? `#${row.target.id}` }}</RouterLink
              >
              <span v-else class="text-text-muted">—</span>
            </td>
            <td class="max-w-[28rem] px-3 py-2 text-text-secondary" :title="describe(row)">
              <span class="line-clamp-2">{{ describe(row) }}</span>
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
</template>
