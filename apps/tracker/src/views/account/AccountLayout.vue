<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { SearchX } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { rememberLast, useAccounts } from '@/stores/accounts'
import { provideAccount } from './context'

const route = useRoute()
const accounts = useAccounts()

const accountId = computed(() => Number(route.params.accountId))
const account = computed(() => accounts.byId.get(accountId.value))

// Sections below only render once the account exists, so this is safe.
provideAccount(computed(() => account.value as AccountResponse))

watch(
  account,
  (value) => {
    if (value) rememberLast(value.id)
  },
  { immediate: true },
)
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
