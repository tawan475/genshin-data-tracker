<script setup lang="ts">
import { computed, ref } from 'vue'
import { Info } from 'lucide-vue-next'
import CopyField from '@/components/import/CopyField.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { trackerApiUrl } from '@/data/import-setup'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * The user's Irminsul key for every account: each upload goes to the account
 * with the capture's UID, and a new UID gets a new account. Like an account's
 * key it is readable once (only its hash is stored).
 */
const session = useSession()
const feedback = useFeedback()
const url = trackerApiUrl()
const newKey = ref<string | null>(null)
const busy = ref<'new' | 'revoke' | null>(null)
const active = computed(() => session.me?.hasImportKey ?? false)

async function create() {
  if (active.value) {
    const ok = await feedback.confirm({
      title: 'New import key?',
      detail: 'Old key stops working.',
      confirmLabel: 'New key',
      tone: 'danger',
    })
    if (!ok) return
  }
  busy.value = 'new'
  try {
    newKey.value = await session.newImportKey()
  } catch (error) {
    feedback.error('No key made', error)
  } finally {
    busy.value = null
  }
}

async function revoke() {
  const ok = await feedback.confirm({
    title: 'Revoke import key?',
    detail: "Irminsul stops uploading with it. Accounts' own keys keep working.",
    confirmLabel: 'Revoke',
    tone: 'danger',
  })
  if (!ok) return
  busy.value = 'revoke'
  try {
    await session.revokeImportKey()
    newKey.value = null
    feedback.toast({ tone: 'success', title: 'Key revoked' })
  } catch (error) {
    feedback.error('Key not revoked', error)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <UiPanel title="Irminsul (all accounts)">
    <div class="flex flex-col gap-4">
      <CopyField label="Tracker URL" :value="url" url />
      <CopyField v-if="newKey" label="Import key" :value="newKey" note="Shown once" />
      <div class="flex flex-col gap-1.5">
        <span v-if="!newKey" class="text-sm font-medium text-text-secondary">Import key</span>
        <div class="flex flex-wrap items-center gap-3">
          <UiButton
            :loading="busy === 'new'"
            :disabled="!!busy"
            title="Keys are shown once. A new key replaces the old one."
            @click="create"
          >
            New key
          </UiButton>
          <UiButton
            v-if="active"
            variant="ghost"
            :loading="busy === 'revoke'"
            :disabled="!!busy"
            @click="revoke"
          >
            Revoke
          </UiButton>
          <UiBadge v-if="active && !newKey" tone="success">Active</UiBadge>
          <span v-else-if="!active" class="text-sm text-text-muted">None</span>
        </div>
      </div>
      <p
        class="flex items-center gap-1.5 self-start text-sm text-text-muted"
        title="Uploads go to the account with the capture's UID; a new UID gets a new account."
      >
        <Info class="size-4 shrink-0" aria-hidden="true" />
        Routed by UID
      </p>
    </div>
  </UiPanel>
</template>
