<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { ref, watch } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { api } from '@/api'
import { trackerApiUrl } from '@/data/import-setup'
import { t } from '@/i18n'
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
    title: t('transfer.key.rotateTitle'),
    detail: t('transfer.key.rotateDetail'),
    confirmLabel: t('transfer.key.newKey'),
    tone: 'danger',
  })
  if (!ok) return
  const id = props.account.id
  rotating.value = true
  try {
    const { importKey } = await api.rotateImportKey(id)
    if (props.account.id === id) newKey.value = importKey
  } catch (error) {
    feedback.error(t('transfer.key.notChanged'), error)
  } finally {
    rotating.value = false
  }
}
</script>

<template>
  <UiPanel title="Irminsul">
    <div class="flex flex-col gap-4">
      <CopyField :label="$t('transfer.key.trackerUrl')" :value="url" url />
      <CopyField
        v-if="newKey"
        :label="$t('transfer.key.importKey')"
        :value="newKey"
        :note="$t('transfer.key.shownOnce')"
      />
      <div v-else class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text-secondary">{{
          $t('transfer.key.importKey')
        }}</span>
        <div class="flex flex-wrap items-center gap-3">
          <UiButton :loading="rotating" :title="$t('transfer.key.newKeyHint')" @click="rotate">
            {{ $t('transfer.key.newKey') }}
          </UiButton>
          <span class="text-sm text-text-muted">{{ $t('transfer.key.hidden') }}</span>
        </div>
      </div>
      <RouterLink
        :to="{ name: 'settings' }"
        class="self-start text-sm font-medium text-accent-text hover:underline"
        :title="$t('transfer.key.allAccountsHint')"
      >
        {{ $t('transfer.key.allAccounts') }}
      </RouterLink>
      <details class="group">
        <summary
          class="-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight
            class="size-4 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          {{ $t('transfer.key.setup') }}
        </summary>
        <IrminsulSteps class="pt-1 pb-1" />
      </details>
    </div>
  </UiPanel>
</template>
