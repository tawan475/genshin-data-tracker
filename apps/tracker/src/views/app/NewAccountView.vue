<script setup lang="ts">
import type { AccountCreatedResponse } from '@gdt/shared'
import { computed, ref } from 'vue'
import AccountFields from '@/components/import/AccountFields.vue'
import CopyField from '@/components/import/CopyField.vue'
import CaptureSteps from '@/components/import/CaptureSteps.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError } from '@/api'
import { t } from '@/i18n'
import { errorText } from '@/i18n/api-errors'
import {
  emptyAccountForm,
  trackerApiUrl,
  validateAccountForm,
  type AccountFormErrors,
} from '@/data/import-setup'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/**
 * Adds a Genshin account, then shows what Irminsul needs: the tracker URL
 * and the import key, which is readable only here (the server keeps a hash).
 */
const accounts = useAccounts()
const feedback = useFeedback()
const form = ref(emptyAccountForm())
const errors = ref<AccountFormErrors>({})
const formError = ref('')
const busy = ref(false)
const created = ref<AccountCreatedResponse | null>(null)
/** Remounts the fields (and their "server chosen by hand" memory) for another account. */
const formKey = ref(0)

const account = computed(() =>
  created.value ? (accounts.byId.get(created.value.account.id) ?? created.value.account) : null,
)
const url = trackerApiUrl()

async function submit() {
  formError.value = ''
  const result = validateAccountForm(form.value)
  if (!result.ok) {
    errors.value = result.errors
    return
  }
  errors.value = {}
  busy.value = true
  try {
    created.value = await accounts.create(result.input)
    feedback.toast({
      tone: 'success',
      title: t('accounts.new.added', { name: accounts.displayName(created.value.account) }),
    })
    window.scrollTo({ top: 0 })
  } catch (error) {
    const fields: AccountFormErrors =
      error instanceof ApiRequestError
        ? {
            name: error.issueFor('name'),
            uid: error.issueFor('uid'),
            server: error.issueFor('server'),
          }
        : {}
    errors.value = fields
    if (!fields.name && !fields.uid && !fields.server) {
      formError.value = errorText(error, t('accounts.new.notAdded'))
    }
  } finally {
    busy.value = false
  }
}

function addAnother() {
  created.value = null
  form.value = emptyAccountForm()
  formKey.value++
  errors.value = {}
  window.scrollTo({ top: 0 })
}
</script>

<template>
  <template v-if="!created || !account">
    <PageHeader :title="$t('accounts.new.title')" />
    <UiPanel class="max-w-2xl">
      <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
        <AccountFields :key="formKey" v-model="form" :errors="errors" :disabled="busy" />
        <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UiButton type="submit" variant="primary" :loading="busy">{{
            $t('accounts.new.add')
          }}</UiButton>
          <UiButton variant="ghost" :to="{ name: 'home' }">{{ $t('common.cancel') }}</UiButton>
        </div>
      </form>
    </UiPanel>
  </template>

  <template v-else>
    <PageHeader :title="$t('accounts.new.connect')" />
    <div class="flex max-w-2xl flex-col gap-6">
      <UiPanel>
        <div class="flex flex-col gap-4">
          <CopyField :label="$t('common.trackerUrl')" :value="url" url />
          <CopyField
            :label="$t('common.importKey')"
            :value="created.importKey"
            :note="$t('common.shownOnce')"
          />
          <CaptureSteps class="border-t border-border-subtle pt-4" />
        </div>
      </UiPanel>
      <div class="flex flex-wrap gap-2">
        <UiButton
          variant="primary"
          :to="{ name: 'account-overview', params: { accountId: account.id } }"
        >
          {{ $t('accounts.new.overview') }}
        </UiButton>
        <UiButton :to="{ name: 'account-import', params: { accountId: account.id } }">
          {{ $t('accounts.new.importFiles') }}
        </UiButton>
        <UiButton variant="ghost" @click="addAnother">{{ $t('accounts.new.addAnother') }}</UiButton>
      </div>
    </div>
  </template>
</template>
