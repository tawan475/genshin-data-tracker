<script setup lang="ts">
import { computed, ref } from 'vue'
import { Info } from 'lucide-vue-next'
import CopyField from '@/components/import/CopyField.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { trackerApiUrl } from '@/data/import-setup'
import { t } from '@/i18n'
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
      title: t('settings.importKey.newTitle'),
      detail: t('settings.importKey.newDetail'),
      confirmLabel: t('settings.importKey.newKey'),
      tone: 'danger',
    })
    if (!ok) return
  }
  busy.value = 'new'
  try {
    newKey.value = await session.newImportKey()
  } catch (error) {
    feedback.error(t('settings.importKey.notMade'), error)
  } finally {
    busy.value = null
  }
}

async function revoke() {
  const ok = await feedback.confirm({
    title: t('settings.importKey.revokeTitle'),
    detail: t('settings.importKey.revokeDetail'),
    confirmLabel: t('settings.importKey.revoke'),
    tone: 'danger',
  })
  if (!ok) return
  busy.value = 'revoke'
  try {
    await session.revokeImportKey()
    newKey.value = null
    feedback.toast({ tone: 'success', title: t('settings.importKey.revoked') })
  } catch (error) {
    feedback.error(t('settings.importKey.notRevoked'), error)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <UiPanel :title="$t('settings.importKey.title')">
    <div class="flex flex-col gap-4">
      <CopyField :label="$t('common.trackerUrl')" :value="url" url />
      <CopyField
        v-if="newKey"
        :label="$t('common.importKey')"
        :value="newKey"
        :note="$t('common.shownOnce')"
      />
      <div class="flex flex-col gap-1.5">
        <span v-if="!newKey" class="text-sm font-medium text-text-secondary">{{
          $t('common.importKey')
        }}</span>
        <div class="flex flex-wrap items-center gap-3">
          <UiButton
            :loading="busy === 'new'"
            :disabled="!!busy"
            :title="$t('settings.importKey.newKeyTitle')"
            @click="create"
          >
            {{ $t('settings.importKey.newKey') }}
          </UiButton>
          <UiButton
            v-if="active"
            variant="ghost"
            :loading="busy === 'revoke'"
            :disabled="!!busy"
            @click="revoke"
          >
            {{ $t('settings.importKey.revoke') }}
          </UiButton>
          <UiBadge v-if="active && !newKey" tone="success">{{ $t('common.active') }}</UiBadge>
          <span v-else-if="!active" class="text-sm text-text-muted">{{ $t('common.none') }}</span>
        </div>
      </div>
      <p
        class="flex items-center gap-1.5 self-start text-sm text-text-muted"
        :title="$t('settings.importKey.routedTitle')"
      >
        <Info class="size-4 shrink-0" aria-hidden="true" />
        {{ $t('settings.importKey.routed') }}
      </p>
    </div>
  </UiPanel>
</template>
