<script setup lang="ts">
import UiBadge from '@/components/ui/UiBadge.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useSession } from '@/stores/session'

const session = useSession()
</script>

<template>
  <UiPanel title="Profile">
    <dl v-if="session.me" class="flex flex-col divide-y divide-border-subtle">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-3">
        <dt class="text-text-secondary">Username</dt>
        <dd class="min-w-0 truncate font-mono">{{ session.me.username }}</dd>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3">
        <dt class="text-text-secondary">Email</dt>
        <dd v-if="session.me.email" class="flex min-w-0 items-center gap-2">
          <span class="min-w-0 truncate">{{ session.me.email }}</span>
          <UiBadge :tone="session.me.emailVerified ? 'success' : 'warning'">
            {{ session.me.emailVerified ? 'Verified' : 'Unverified' }}
          </UiBadge>
        </dd>
        <dd v-else class="text-text-muted">—</dd>
      </div>
    </dl>
  </UiPanel>
</template>
