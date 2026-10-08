<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SearchX } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { loadLatestInventory } from '@/data/account-data'
import { loadTraveler } from '@/data/traveler'
import { preload } from '@/data/use-resource'
import { loadGameIcons } from '@/lib/assets'
import { rememberLast, useAccounts } from '@/stores/accounts'
import { provideAccount } from './context'

const route = useRoute()
const accounts = useAccounts()

const accountId = computed(() => Number(route.params.accountId))
const account = computed(() => accounts.byId.get(accountId.value))

// Sections below only render once the account exists, so this is safe.
provideAccount(computed(() => account.value as AccountResponse))

// Which game images the host lacks and which we serve (small): portraits and
// icons render before it arrives and switch once it does.
loadGameIcons().catch(() => {})

watch(
  account,
  (value) => {
    if (!value) return
    rememberLast(value.id)
    void loadTraveler(value.id)
  },
  { immediate: true },
)

/**
 * While the browser is idle after an account opens: the account pages' code
 * and the newest capture (Characters, Weapons and Artifacts all read it), so
 * the first visit to each page shows at once instead of loading.
 */
const router = useRouter()
let idle = 0
function prefetch() {
  for (const record of router.getRoutes()) {
    const load = record.components?.default
    if (record.path.startsWith('/app/a/:accountId') && typeof load === 'function') {
      void (load as () => Promise<unknown>)().catch(() => undefined)
    }
  }
  if (account.value?.latest) preload(loadLatestInventory(account.value))
}
// Safari has no requestIdleCallback: a timeout stands in.
const hasIdle = typeof window.requestIdleCallback === 'function'
const whenIdle = (fn: () => void): number =>
  hasIdle ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500)
watch(
  () => account.value?.dataVersion,
  (version) => {
    if (version === undefined) return
    idle = whenIdle(prefetch)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (hasIdle) window.cancelIdleCallback(idle)
  else clearTimeout(idle)
})
</script>

<template>
  <RouterView v-if="account" />
  <UiEmpty
    v-else
    title="Account not found"
    body="It may have been deleted, or it belongs to someone else."
  >
    <template #icon><SearchX aria-hidden="true" /></template>
    <UiButton :to="{ name: 'home' }" variant="primary">All accounts</UiButton>
  </UiEmpty>
</template>
