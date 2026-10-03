<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useSession } from '@/stores/session'

const session = useSession()
</script>

<template>
  <UiPanel title="Profile" description="How you sign in.">
    <dl v-if="session.me" class="flex flex-col divide-y divide-border-subtle">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-3">
        <dt class="text-text-secondary">Username</dt>
        <dd class="min-w-0 truncate font-mono">{{ session.me.username }}</dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3">
        <dt class="text-text-secondary">Email</dt>
        <dd class="flex min-w-0 items-center gap-2">
          <span class="min-w-0 truncate">{{ session.me.email }}</span>
          <UiBadge :tone="session.me.emailVerified ? 'success' : 'warning'">
            {{ session.me.emailVerified ? 'Verified' : 'Unverified' }}
          </UiBadge>
        </dd>
      </div>
    </dl>
    <p class="mt-4 text-sm text-text-muted">
      <template v-if="session.me && !session.me.emailVerified">
        Email verification is not available yet; the address is only used to sign in.
      </template>
      Signing in with Google or Discord will be connected from here later.
    </p>
  </UiPanel>
</template>
