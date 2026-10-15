<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { ref, watch } from 'vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { api } from '@/api'
import { t } from '@/i18n'
import { noteLiveChange } from '@/live/journal'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/**
 * The account's live sync switch (setting `liveSync`): chosen here, on the
 * website, never in irminsul. Off, irminsul uploads snapshots only.
 */
const props = defineProps<{ account: AccountResponse }>()
const accounts = useAccounts()
const feedback = useFeedback()

const on = ref(props.account.liveSync ?? false)
watch(
  () => props.account.liveSync,
  (value) => (on.value = value ?? false),
)
const saving = ref(false)

watch(on, async (value) => {
  if (value === (props.account.liveSync ?? false) || saving.value) return
  saving.value = true
  try {
    await api.updateAccountSettings(props.account.id, { liveSync: value })
    await accounts.reload(props.account.id)
    noteLiveChange(props.account.id)
  } catch (error) {
    on.value = !value
    feedback.error(t('common.notSaved'), error)
  } finally {
    saving.value = false
  }
})
</script>

<template>
  <UiPanel :title="$t('live.settings.title')">
    <UiSwitch
      v-model="on"
      :label="$t('live.settings.label')"
      :description="$t('live.settings.description')"
      :disabled="saving"
    />
  </UiPanel>
</template>
