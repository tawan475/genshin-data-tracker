<script setup lang="ts">
import type { AccountResponse } from '@gdt/shared'
import { ref } from 'vue'
import { Download, MonitorSmartphone, Radio } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { api } from '@/api'
import { t } from '@/i18n'
import { CAPTURE_DOWNLOAD_URL } from '@/lib/capture-app'
import { noteLiveChange } from '@/live/journal'
import { useFeedback } from '@/stores/feedback'

/**
 * The capture app for this account: get it, sign in from it (its sessions
 * are under Devices), and the chart points live sync kept. Live sync has no
 * switch here: the tracker takes every change, the app decides whether to
 * send them. The open journal is discarded from the Snapshots page.
 */
const props = defineProps<{ account: AccountResponse }>()
const feedback = useFeedback()

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
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap gap-2">
        <UiButton
          variant="primary"
          :href="CAPTURE_DOWNLOAD_URL"
          :title="$t('wishes.capture.downloadTitle')"
        >
          <Download class="size-4" aria-hidden="true" />
          {{ $t('wishes.capture.download') }}
        </UiButton>
        <UiButton :to="{ name: 'settings-devices' }" :title="$t('live.settings.devicesTitle')">
          <MonitorSmartphone class="size-4" aria-hidden="true" />
          {{ $t('wishes.capture.devices') }}
        </UiButton>
      </div>
      <div class="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3 text-sm">
        <p
          class="flex min-w-0 flex-[999_1_14rem] items-center gap-2 text-text-secondary"
          :title="$t('live.settings.alwaysTitle')"
        >
          <Radio class="size-4 shrink-0 text-success-text" aria-hidden="true" />
          {{ $t('live.settings.always') }}
        </p>
        <UiButton
          size="sm"
          variant="ghost"
          :loading="deleting"
          :title="`${$t('live.settings.deletePointsTitle')}. ${$t('live.settings.exportNote')}`"
          @click="deletePoints"
        >
          {{ $t('live.settings.deletePoints') }}
        </UiButton>
      </div>
    </div>
  </UiPanel>
</template>
