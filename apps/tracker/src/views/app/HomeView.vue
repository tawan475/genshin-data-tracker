<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import { Plus, Users } from 'lucide-vue-next'
import AccountCard from '@/components/overview/AccountCard.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { accountTotals, compressionRatio } from '@/data/overview'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'

/** Every Genshin account of the signed-in user, with its latest figures. */
const accounts = useAccounts()
// Relative times ("3 hours ago") move on once a minute.
const nowMs = shallowRef(Date.now())
useIntervalFn(() => (nowMs.value = Date.now()), 60_000)

// The router loaded the list once per session; refresh it so captures that
// Irminsul uploaded since then show up. On failure, keep what we have.
onMounted(() => {
  accounts.refresh().catch(() => undefined)
})

const totals = computed(() => {
  if (accounts.list.length < 2) return null
  const t = accountTotals(accounts.list)
  const ratio = compressionRatio(t.rawBytes, t.storedBytes)
  return [
    { label: 'Accounts', value: formatNumber(t.accounts), mono: true },
    { label: 'Snapshots', value: formatNumber(t.snapshots), mono: true },
    {
      label: 'Uploaded',
      value: formatBytes(t.rawBytes),
      title: `${formatNumber(t.rawBytes)} bytes`,
      mono: true,
    },
    {
      label: 'Stored',
      value: formatBytes(t.storedBytes),
      title: `${formatNumber(t.storedBytes)} bytes`,
      mono: true,
    },
    {
      label: 'Ratio',
      value: ratio ?? '—',
      title: ratio ? `Stored ${ratio} smaller than uploaded` : undefined,
      mono: true,
    },
    {
      label: 'Last captured',
      value: t.lastCapture ? formatRelative(t.lastCapture, nowMs.value) : 'Never',
      title: t.lastCapture ? formatDateTime(t.lastCapture) : undefined,
      mono: false,
    },
  ]
})
</script>

<template>
  <PageHeader title="Accounts">
    <template v-if="accounts.list.length" #actions>
      <UiButton variant="primary" :to="{ name: 'account-new' }">
        <Plus class="size-5" aria-hidden="true" />
        Add account
      </UiButton>
    </template>
  </PageHeader>

  <UiPanel v-if="!accounts.list.length" flush>
    <UiEmpty title="No accounts yet">
      <template #icon><Users aria-hidden="true" /></template>
      <UiButton variant="primary" :to="{ name: 'account-new' }">
        <Plus class="size-5" aria-hidden="true" />
        Add account
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <template v-else>
    <dl
      v-if="totals"
      class="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border-default bg-surface-raised p-4 sm:grid-cols-3 xl:grid-cols-6"
    >
      <div v-for="item in totals" :key="item.label" class="min-w-0">
        <dt class="text-sm text-text-muted">{{ item.label }}</dt>
        <dd
          class="truncate text-lg font-medium"
          :class="item.mono ? 'tabular font-mono' : ''"
          :title="item.title"
        >
          {{ item.value }}
        </dd>
      </div>
    </dl>

    <ul class="grid gap-4 md:grid-cols-2" aria-label="Accounts">
      <li v-for="account in accounts.list" :key="account.id" class="flex">
        <AccountCard :account="account" :now="nowMs" class="w-full" />
      </li>
    </ul>
  </template>
</template>
