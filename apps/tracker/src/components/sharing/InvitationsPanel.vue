<script setup lang="ts">
import type { InvitationResponse } from '@gdt/shared'
import { ref } from 'vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { t } from '@/i18n'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/** Accounts others invited this user to share (Home): Accept or Decline each. */
const accounts = useAccounts()
const feedback = useFeedback()
const busy = ref<number | null>(null)

function name(invite: InvitationResponse): string {
  return accounts.displayName({ id: invite.accountId, name: invite.accountName, uid: invite.uid })
}

async function answer(invite: InvitationResponse, accept: boolean) {
  busy.value = invite.accountId
  try {
    await accounts.answerInvitation(invite.accountId, accept)
    if (accept)
      feedback.toast({ tone: 'success', title: t('sharing.accepted'), hint: name(invite) })
  } catch (error) {
    feedback.error(t('sharing.answerFailed'), error)
    await accounts.refreshInvitations()
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <UiPanel v-if="accounts.invitations.length" :title="$t('sharing.invitations')">
    <ul class="flex flex-col divide-y divide-border-subtle">
      <li
        v-for="invite in accounts.invitations"
        :key="invite.accountId"
        class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
      >
        <div class="min-w-0 flex-[999_1_14rem]">
          <p class="flex min-w-0 items-center gap-2">
            <span class="truncate font-medium">{{ name(invite) }}</span>
            <UiBadge tone="accent">{{ $t(`sharing.role.${invite.role}`) }}</UiBadge>
          </p>
          <p class="truncate text-sm text-text-muted">
            <span>{{ invite.owner }}</span>
            <span v-if="invite.uid && invite.accountName" class="tabular font-mono">
              · {{ invite.uid }}</span
            >
            ·
            <time :title="formatDateTime(invite.invitedAt)">{{
              formatRelative(invite.invitedAt)
            }}</time>
          </p>
        </div>
        <div class="flex flex-1 justify-end gap-2">
          <UiButton
            size="sm"
            variant="ghost"
            :disabled="busy !== null"
            @click="answer(invite, false)"
          >
            {{ $t('sharing.decline') }}
          </UiButton>
          <UiButton
            size="sm"
            variant="primary"
            :loading="busy === invite.accountId"
            :disabled="busy !== null"
            @click="answer(invite, true)"
          >
            {{ $t('sharing.accept') }}
          </UiButton>
        </div>
      </li>
    </ul>
  </UiPanel>
</template>
