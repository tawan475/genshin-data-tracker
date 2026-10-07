<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/shell/AppShell.vue'
import { useLiveUpdates } from '@/live/live-updates'
import { useAccounts } from '@/stores/accounts'
import { useSession } from '@/stores/session'

// Pages update as data arrives (irminsul uploads, other tabs and devices).
useLiveUpdates()

// The session ended under this tab (this device was signed out from another,
// or every device was): to the sign-in page, back here after.
const session = useSession()
const accounts = useAccounts()
const route = useRoute()
const router = useRouter()
watch(
  () => session.status,
  (status) => {
    if (status !== 'signed-out') return
    accounts.clear()
    void router.replace({ name: 'login', query: { next: route.fullPath } })
  },
)
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
