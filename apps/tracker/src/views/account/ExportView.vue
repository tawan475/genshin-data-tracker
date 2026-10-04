<template>
  <div class="max-w-7xl mx-auto space-y-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-white transition-colors">Export</h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 transition-colors">
        Export your latest account data to external tools or download bulk snapshot exports
      </p>
    </div>

    <div
      v-if="!account.latest"
      class="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-500 p-4 rounded-xl border border-yellow-200 dark:border-yellow-900/50 transition-colors"
    >
      No snapshots yet. Import data first.
    </div>

    <div class="space-y-8">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- Card 1: Optimizer -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
            >
              <Calculator class="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">
              Optimizer
            </h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your latest account data directly into the Genshin Optimizer format to calculate
            your best builds.
          </p>
          <BaseButton
            variant="blue"
            block
            size="lg"
            :loading="exporting === OPTIMIZER"
            :disabled="!canExport"
            @click="exportData(OPTIMIZER)"
          >
            Export Latest Data to Genshin Optimizer
          </BaseButton>
        </div>

        <!-- Card 2: Planner -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
            >
              <CalendarCheck class="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">
              Planner
            </h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your latest account data to Seelie.me for tracking inventory and farming
            materials.
          </p>
          <BaseButton
            variant="emerald"
            block
            size="lg"
            :loading="exporting === SEELIE_INVENTORY"
            :disabled="!canExport"
            @click="exportData(SEELIE_INVENTORY)"
          >
            Export Latest Data to Seelie.me
          </BaseButton>
        </div>

        <!-- Card 3: Achievement -->
        <div
          class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col transition-colors"
        >
          <div class="flex items-center gap-3 mb-4">
            <div
              class="p-3 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded-lg transition-colors"
            >
              <Trophy class="w-6 h-6" aria-hidden="true" />
            </div>
            <h2 class="text-lg font-bold text-slate-800 dark:text-white transition-colors">
              Achievement
            </h2>
          </div>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-6 flex-1 transition-colors">
            Export your achievements tracking to Stardb.gg or Seelie.me.
          </p>
          <div class="space-y-3">
            <BaseButton
              variant="purple"
              block
              size="lg"
              :loading="exporting === STARDB"
              :disabled="!canExport"
              @click="exportData(STARDB)"
            >
              Export Latest data to Stardb.gg
            </BaseButton>
            <BaseButton
              variant="secondary"
              block
              size="lg"
              :loading="exporting === SEELIE_ACHIEVEMENTS"
              :disabled="!canExport"
              @click="exportData(SEELIE_ACHIEVEMENTS)"
            >
              Export Latest data to Seelie.me
            </BaseButton>
          </div>
        </div>
      </div>

      <p class="text-sm text-slate-500 dark:text-slate-400">
        Bulk exports:
        <RouterLink
          :to="{ name: 'account-snapshots', params: { accountId: account.id } }"
          class="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >Snapshots</RouterLink
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, ref, watch } from 'vue'
import { CalendarCheck, Calculator, Trophy } from 'lucide-vue-next'
import BaseButton from '@/components/legacy/BaseButton.vue'
import { api } from '@/api'
import { copyText } from '@/data/import-setup'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

/**
 * The original "Export" page: copies the newest snapshot's GOOD file to the
 * clipboard and opens the tool to paste it into. Bulk zips are made from the
 * Snapshots page (in the browser; the server keeps no export jobs).
 */
const account = useAccount()
const feedback = useFeedback()

const OPTIMIZER = 'https://frzyc.github.io/genshin-optimizer/#/setting'
const SEELIE_INVENTORY = 'https://seelie.me/inventory'
const STARDB = 'https://stardb.gg/en/import'
const SEELIE_ACHIEVEMENTS = 'https://seelie.me/achievements'

const exporting = ref<string | null>(null)
const canExport = computed(() => !!account.value.latest && exporting.value === null)

// The GOOD text of the newest snapshot, the same file "Download" on the
// Snapshots page saves. Fetched as the page opens, so a click copies at once:
// browsers only allow clipboard writes and new tabs right after the click.
let pending: { key: string; text: Promise<string> } | null = null

function latestGoodText(a: AccountResponse): Promise<string> {
  const latest = a.latest
  if (!latest) return Promise.reject(new Error('No snapshots yet'))
  const key = `${a.id}:${latest.id}`
  if (pending?.key !== key) {
    const text = api.snapshotGood(a.id, latest.id).then((good) => JSON.stringify(good))
    text.catch(() => {
      if (pending?.key === key) pending = null
    })
    pending = { key, text }
  }
  return pending.text
}

watch(
  () => [account.value.id, account.value.latest?.id],
  () => {
    if (account.value.latest) latestGoodText(account.value).catch(() => undefined)
  },
  { immediate: true },
)

const exportData = async (url: string) => {
  if (!account.value.latest || exporting.value !== null) return

  exporting.value = url
  try {
    const text = await latestGoodText(account.value)
    if (!(await copyText(text))) throw new Error('The browser refused clipboard access.')
    feedback.toast({ tone: 'success', title: 'Copied to clipboard!' })
    const tab = window.open(url, '_blank')
    if (tab) tab.opener = null
  } catch (error) {
    console.error('Export error', error)
    feedback.error('Failed to export data', error)
  } finally {
    exporting.value = null
  }
}
</script>
