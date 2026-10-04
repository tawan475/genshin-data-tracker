<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { api } from '@/api'
import { trackerApiUrl } from '@/data/import-setup'
import { useFeedback } from '@/stores/feedback'
import CopyField from './CopyField.vue'
import IrminsulSteps from './IrminsulSteps.vue'

/**
 * What Irminsul needs to upload by itself: the tracker URL and the import
 * key. The server keeps only the key's hash, so a key is readable once:
 * this replaces it and shows the new one once.
 */
const props = defineProps<{ account: AccountResponse }>()
const feedback = useFeedback()
const url = trackerApiUrl()
const newKey = ref<string | null>(null)
const rotating = ref(false)

// A revealed key belongs to one account; never carry it over to another.
watch(
  () => props.account.id,
  () => (newKey.value = null),
)

async function rotate() {
  const ok = await feedback.confirm({
    title: 'New import key?',
    detail: 'Old key stops working.',
    confirmLabel: 'New key',
    tone: 'danger',
  })
  if (!ok) return
  const id = props.account.id
  rotating.value = true
  try {
    const { importKey } = await api.rotateImportKey(id)
    if (props.account.id === id) newKey.value = importKey
  } catch (error) {
    feedback.error('Key not changed', error)
  } finally {
    rotating.value = false
  }
}
</script>

<template>
  <UiPanel title="Irminsul">
    <div class="flex flex-col gap-4">
      <CopyField label="Tracker URL" :value="url" url />
      <CopyField v-if="newKey" label="Import key" :value="newKey" note="Shown once" />
      <div v-else class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text-secondary">Import key</span>
        <div class="flex flex-wrap items-center gap-3">
          <UiButton
            :loading="rotating"
            title="Keys are shown once. A new key replaces the old one."
            @click="rotate"
          >
            New key
          </UiButton>
          <span class="text-sm text-text-muted">Hidden</span>
        </div>
      </div>
      <RouterLink
        :to="{ name: 'settings' }"
        class="self-start text-sm font-medium text-accent-text hover:underline"
        title="One key for every account: uploads go to the account with the capture's UID"
      >
        Key for all accounts
      </RouterLink>
      <details class="group">
        <summary
          class="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight
            class="size-4 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          Setup
        </summary>
        <IrminsulSteps class="pt-1 pb-1" />
      </details>
    </div>
  </UiPanel>
</template>
