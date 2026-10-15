<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'
import { api } from '@/api'
import { t } from '@/i18n'
import { noteLiveChange } from '@/live/journal'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/**
 * The account's live sync switch (setting `liveSync`): chosen here, on the
 * website, never in irminsul. Off, irminsul uploads snapshots only. The
 * chart points it kept can be deleted here; the open journal from the
 * Snapshots page (Discard).
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

const deleting = ref(false)
async function deletePoints() {
  const ok = await feedback.confirm({
    title: t('live.settings.deletePoints'),
    detail: t('live.settings.deletePointsConfirm'),
    confirmLabel: t('live.settings.deletePoints'),
    tone: 'danger',
  })
  if (!ok) return
  deleting.value = true
  try {
    await api.deletePoints(props.account.id)
    noteLiveChange(props.account.id)
    feedback.toast({ tone: 'success', title: t('live.settings.pointsDeleted') })
  } catch (error) {
    feedback.error(t('common.notSaved'), error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UiPanel :title="$t('live.settings.title')">
    <UiSwitch
      v-model="on"
      :label="$t('live.settings.label')"
      :description="$t('live.settings.description')"
      :disabled="saving"
    />
    <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
      <p class="min-w-0 flex-[999_1_14rem] text-sm text-text-muted">
        {{ $t('live.settings.exportNote') }}
      </p>
      <UiButton
        size="sm"
        variant="ghost"
        :loading="deleting"
        :title="$t('live.settings.deletePointsTitle')"
        @click="deletePoints"
      >
        {{ $t('live.settings.deletePoints') }}
      </UiButton>
    </div>
  </UiPanel>
</template>
