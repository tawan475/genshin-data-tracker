<script setup lang="ts">
import type { SignInMethod } from '@gdt/shared'
import { KeyRound } from 'lucide-vue-next'
import ProviderMark from '@/components/oauth/ProviderMark.vue'

/** How a user signs in: a key for a password, the provider's mark for Discord / Google. */
defineProps<{ methods: readonly SignInMethod[] }>()
const LABEL: Record<SignInMethod, string> = {
  password: 'Password',
  discord: 'Discord',
  google: 'Google',
}
</script>

<template>
  <span class="inline-flex gap-1">
    <span
      v-for="method in methods"
      :key="method"
      class="inline-flex h-[1.375rem] min-w-6 items-center justify-center rounded bg-surface-overlay px-1 text-text-secondary"
      :title="LABEL[method]"
    >
      <KeyRound v-if="method === 'password'" class="size-3.5" aria-hidden="true" />
      <ProviderMark v-else :provider="method" class="size-3.5" />
      <span class="sr-only">{{ LABEL[method] }}</span>
    </span>
  </span>
</template>
