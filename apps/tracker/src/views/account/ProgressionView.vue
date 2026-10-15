<script setup lang="ts">
import type { SnapshotResponse } from '@gdt/shared'
import { computed, watch } from 'vue'
import { History, Upload } from 'lucide-vue-next'
import DetailedProgression from '@/components/progression/DetailedProgression.vue'
import MonthlyAnalysisCard from '@/components/progression/MonthlyAnalysisCard.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiError from '@/components/ui/UiError.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { loadPoints, loadSnapshots } from '@/data/account-data'
import { buildHistory, withPoints } from '@/data/overview'
import { useResource } from '@/data/use-resource'
import { useAccounts } from '@/stores/accounts'
import { useAccount } from './context'

/**
 * Mora and primogems per period (new charts) above the original tracker's
 * monthly analysis table, all from snapshot summaries plus, for the table's
 * extraction column, the materials history.
 */
const account = useAccount()
const accounts = useAccounts()

// Pick up captures uploaded since the account list was loaded; a moved data
// version invalidates the snapshot cache. A failure keeps what we have.
watch(
  () => account.value.id,
  (id) => {
    accounts.reload(id).catch(() => undefined)
  },
  { immediate: true },
)

// Tagged with the account id, so switching accounts shows placeholders
// rather than the previous account's history while the next one loads.
const { data, error, reload } = useResource(
  () => account.value,
  async (a): Promise<{ accountId: number; list: SnapshotResponse[] }> => ({
    accountId: a.id,
    list: await loadSnapshots(a),
  }),
)
const list = computed(() => {
  const value = data.value
  return value && value.accountId === account.value.id ? value.list : undefined
})
// Live sync's chart points between snapshots (none when it is off).
const points = useResource(
  () => account.value,
  (a) => loadPoints(a),
)
const captures = computed(() =>
  list.value ? withPoints(buildHistory(list.value).captures, points.data.value ?? []) : undefined,
)

const importRoute = computed(() => ({
  name: 'account-import',
  params: { accountId: account.value.id },
}))
</script>

<template>
  <PageHeader :title="$t('overview.progression')" />

  <UiPanel v-if="!account.latest" flush>
    <UiEmpty :title="$t('overview.noSnapshots')">
      <template #icon><History aria-hidden="true" /></template>
      <UiButton variant="primary" :to="importRoute">
        <Upload class="size-4" aria-hidden="true" />
        {{ $t('overview.import') }}
      </UiButton>
    </UiEmpty>
  </UiPanel>

  <UiError
    v-else-if="error && !list"
    :title="$t('overview.historyUnavailable')"
    :error="error"
    @retry="reload"
  />

  <div v-else class="flex flex-col gap-6">
    <DetailedProgression
      :captures="captures"
      :defaults="['mora', 'artifacts']"
      default-group="snapshot"
    />
    <MonthlyAnalysisCard :snapshots="list" class="min-w-0" />
  </div>
</template>
