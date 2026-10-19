<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Trash2 } from 'lucide-vue-next'
import AccountFields from '@/components/import/AccountFields.vue'
import ImportKeyPanel from '@/components/import/ImportKeyPanel.vue'
import LiveSyncPanel from '@/components/live/LiveSyncPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { ApiRequestError } from '@/api'
import { t } from '@/i18n'
import { discardImportQueue } from '@/data/import-queue'
import {
  accountFormInput,
  validateAccountForm,
  type AccountFormErrors,
  type AccountFormValues,
} from '@/data/import-setup'
import { saveTraveler, travelerGender } from '@/data/traveler'
import { characterIcon } from '@/lib/assets'
import { formatBytes, formatNumber } from '@/lib/format'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useAccount } from './context'

const account = useAccount()
const accounts = useAccounts()
const feedback = useFeedback()

const travelerOptions = computed(() => [
  { value: 'F' as const, label: t('accounts.settings.lumine') },
  { value: 'M' as const, label: t('accounts.settings.aether') },
])

async function setTraveler(gender: 'F' | 'M') {
  try {
    await saveTraveler(account.value.id, gender)
  } catch (error) {
    feedback.error(t('common.notSaved'), error)
  }
}
const router = useRouter()

const name = computed(() => accounts.displayName(account.value))

// ----------------------------------------------------------------- details

const form = ref<AccountFormValues>({ name: '', uid: '', server: null })
const errors = ref<AccountFormErrors>({})
const saving = ref(false)

function resetForm() {
  const a = account.value
  form.value = { name: a.name ?? '', uid: a.uid ?? '', server: a.server }
  errors.value = {}
}
// Switching accounts keeps this screen mounted: start over with the new one.
watch(() => account.value.id, resetForm, { immediate: true })

const dirty = computed(() => {
  const input = accountFormInput(form.value)
  const a = account.value
  return input.name !== a.name || input.uid !== a.uid || input.server !== a.server
})

async function save() {
  const result = validateAccountForm(form.value)
  if (!result.ok) {
    errors.value = result.errors
    return
  }
  errors.value = {}
  saving.value = true
  try {
    await accounts.update(account.value.id, result.input)
    resetForm()
    feedback.toast({ tone: 'success', title: t('common.saved') })
  } catch (error) {
    if (error instanceof ApiRequestError && error.issues.length > 0) {
      errors.value = {
        name: error.issueFor('name'),
        uid: error.issueFor('uid'),
        server: error.issueFor('server'),
      }
    }
    feedback.error(t('common.notSaved'), error)
  } finally {
    saving.value = false
  }
}

// ------------------------------------------------------------------ delete

const deleteOpen = ref(false)
const typed = ref('')
const deleting = ref(false)
const confirmWord = computed(() => account.value.name?.trim() || t('accounts.settings.confirmWord'))
// NFC: a keyboard may type an accented letter (Vietnamese "xóa") as two code points.
const confirmed = computed(
  () => typed.value.trim().normalize('NFC') === confirmWord.value.normalize('NFC'),
)

/** What goes, in the user's numbers: "151 snapshots · 23.4 MB". */
const loss = computed(() => {
  const count = account.value.snapshotCount
  const snapshots = t('accounts.settings.loss', { n: formatNumber(count) }, count)
  return `${snapshots} · ${formatBytes(account.value.storedBytes)}`
})

function openDelete() {
  typed.value = ''
  deleteOpen.value = true
  // Land on the account list at once after deleting.
  void import('@/views/app/HomeView.vue')
}

async function confirmDelete() {
  if (!confirmed.value) return
  const id = account.value.id
  const label = name.value
  const lost = loss.value
  deleting.value = true
  try {
    await accounts.remove(id)
    discardImportQueue(id)
    deleteOpen.value = false
    feedback.toast({
      tone: 'success',
      title: t('accounts.settings.deleted', { name: label }),
      detail: lost,
    })
    await router.replace({ name: 'home' })
  } catch (error) {
    feedback.error(t('common.notDeleted'), error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PageHeader :title="$t('accounts.settings.title')" />

  <div class="flex max-w-2xl flex-col gap-6">
    <UiPanel :title="$t('accounts.settings.details')">
      <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
        <AccountFields :key="account.id" v-model="form" :errors="errors" :disabled="saving" />
        <div class="flex flex-wrap gap-2">
          <UiButton type="submit" variant="primary" :loading="saving" :disabled="!dirty">
            {{ $t('common.save') }}
          </UiButton>
          <UiButton v-if="dirty" variant="ghost" :disabled="saving" @click="resetForm">
            {{ $t('common.reset') }}
          </UiButton>
        </div>
      </form>
    </UiPanel>

    <UiPanel :title="$t('accounts.settings.traveler')">
      <div class="flex items-center gap-4">
        <img
          :src="characterIcon('Traveler')"
          alt=""
          class="size-12 rounded-lg bg-surface-overlay object-cover"
        />
        <UiSegmented
          :model-value="travelerGender"
          :options="travelerOptions"
          :label="$t('accounts.settings.traveler')"
          @update:model-value="setTraveler"
        />
      </div>
    </UiPanel>

    <LiveSyncPanel :account="account" />

    <ImportKeyPanel :account="account" />

    <section class="rounded-xl border border-danger-border bg-surface-raised shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-4 p-5">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">{{ $t('accounts.settings.deleteAccount') }}</h2>
          <p class="tabular font-mono text-sm text-text-secondary">{{ loss }}</p>
        </div>
        <UiButton variant="danger" :title="$t('accounts.settings.deleteTitle')" @click="openDelete">
          <Trash2 class="size-4" aria-hidden="true" />
          {{ $t('common.delete') }}
        </UiButton>
      </div>
    </section>
  </div>

  <UiModal
    :open="deleteOpen"
    :title="$t('accounts.settings.confirmTitle', { name })"
    @close="deleteOpen = false"
  >
    <form id="delete-account" class="flex flex-col gap-4" @submit.prevent="confirmDelete">
      <i18n-t keypath="accounts.settings.deletes" tag="p" class="text-text-secondary">
        <template #loss>
          <span class="tabular font-mono text-text-primary">{{ loss }}</span>
        </template>
      </i18n-t>
      <UiField
        v-slot="{ id }"
        :label="$t('accounts.settings.typeToConfirm', { word: confirmWord })"
      >
        <UiInput
          :id="id"
          v-model="typed"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          :disabled="deleting"
        />
      </UiField>
    </form>
    <template #footer>
      <UiButton :disabled="deleting" @click="deleteOpen = false">{{
        $t('common.cancel')
      }}</UiButton>
      <UiButton
        type="submit"
        form="delete-account"
        variant="danger"
        :loading="deleting"
        :disabled="!confirmed"
      >
        {{ $t('common.delete') }}
      </UiButton>
    </template>
  </UiModal>
</template>
