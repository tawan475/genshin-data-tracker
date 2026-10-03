<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import { useSession } from '@/stores/session'

const session = useSession()
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-8">
    <span class="font-display text-2xl font-bold"
      >GI<span class="text-accent-text">/</span>tracker</span
    >
    <div class="my-auto py-16">
      <h1 class="font-display text-5xl font-bold tracking-tight">Placeholder landing</h1>
      <div class="mt-8 flex gap-3">
        <UiButton v-if="session.status === 'signed-in'" variant="primary" :to="{ name: 'home' }"
          >Open dashboard</UiButton
        >
        <template v-else>
          <UiButton variant="primary" :to="{ name: 'register' }">Create account</UiButton>
          <UiButton :to="{ name: 'login' }">Sign in</UiButton>
        </template>
      </div>
    </div>
  </div>
</template>
