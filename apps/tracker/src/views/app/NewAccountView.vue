<script setup lang="ts">
import type { AccountCreatedResponse } from '@gdt/shared'
import { computed, ref } from 'vue'
import AccountFields from '@/components/import/AccountFields.vue'
import CopyField from '@/components/import/CopyField.vue'
import IrminsulSteps from '@/components/import/IrminsulSteps.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { ApiRequestError } from '@/api'
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
      title: `Added ${accounts.displayName(created.value.account)}`,
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
      formError.value = error instanceof Error ? error.message : 'Not added'
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
    <PageHeader title="Add account" />
    <UiPanel class="max-w-2xl">
      <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
        <AccountFields :key="formKey" v-model="form" :errors="errors" :disabled="busy" />
        <p v-if="formError" class="text-sm text-danger-text" role="alert">{{ formError }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UiButton type="submit" variant="primary" :loading="busy">Add</UiButton>
          <UiButton variant="ghost" :to="{ name: 'home' }">Cancel</UiButton>
        </div>
      </form>
    </UiPanel>
  </template>

  <template v-else>
    <PageHeader title="Connect Irminsul" />
    <div class="flex max-w-2xl flex-col gap-6">
      <UiPanel>
        <div class="flex flex-col gap-4">
          <CopyField label="Tracker URL" :value="url" url />
          <CopyField label="Import key" :value="created.importKey" note="Shown once" />
          <IrminsulSteps class="border-t border-border-subtle pt-4" />
        </div>
      </UiPanel>
      <div class="flex flex-wrap gap-2">
        <UiButton
          variant="primary"
          :to="{ name: 'account-overview', params: { accountId: account.id } }"
        >
          Overview
        </UiButton>
        <UiButton :to="{ name: 'account-import', params: { accountId: account.id } }">
          Import files
        </UiButton>
        <UiButton variant="ghost" @click="addAnother">Add another</UiButton>
      </div>
    </div>
  </template>
</template>
