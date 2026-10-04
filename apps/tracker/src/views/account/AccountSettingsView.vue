<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Trash2 } from 'lucide-vue-next'
import AccountFields from '@/components/import/AccountFields.vue'
import ImportKeyPanel from '@/components/import/ImportKeyPanel.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiField from '@/components/ui/UiField.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { ApiRequestError } from '@/api'
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

const TRAVELER_OPTIONS = [
  { value: 'F' as const, label: 'Lumine' },
  { value: 'M' as const, label: 'Aether' },
]

async function setTraveler(gender: 'F' | 'M') {
  try {
    await saveTraveler(account.value.id, gender)
  } catch (error) {
    feedback.error('Not saved', error)
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
    feedback.toast({ tone: 'success', title: 'Saved' })
  } catch (error) {
    if (error instanceof ApiRequestError && error.issues.length > 0) {
      errors.value = {
        name: error.issueFor('name'),
        uid: error.issueFor('uid'),
        server: error.issueFor('server'),
      }
    }
    feedback.error('Not saved', error)
  } finally {
    saving.value = false
  }
}

// ------------------------------------------------------------------ delete

const deleteOpen = ref(false)
const typed = ref('')
const deleting = ref(false)
const confirmWord = computed(() => account.value.name?.trim() || 'delete')
const confirmed = computed(() => typed.value.trim() === confirmWord.value)

/** What goes, in the user's numbers: "151 snapshots · 23.4 MB". */
const loss = computed(() => {
  const count = account.value.snapshotCount
  return `${formatNumber(count)} ${count === 1 ? 'snapshot' : 'snapshots'} · ${formatBytes(account.value.storedBytes)}`
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
    feedback.toast({ tone: 'success', title: `Deleted ${label}`, detail: lost })
    await router.replace({ name: 'home' })
  } catch (error) {
    feedback.error('Not deleted', error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PageHeader title="Account settings" />

  <div class="flex max-w-2xl flex-col gap-6">
    <UiPanel title="Details">
      <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
        <AccountFields :key="account.id" v-model="form" :errors="errors" :disabled="saving" />
        <div class="flex flex-wrap gap-2">
          <UiButton type="submit" variant="primary" :loading="saving" :disabled="!dirty">
            Save
          </UiButton>
          <UiButton v-if="dirty" variant="ghost" :disabled="saving" @click="resetForm">
            Reset
          </UiButton>
        </div>
      </form>
    </UiPanel>

    <UiPanel title="Traveler">
      <div class="flex items-center gap-4">
        <img
          :src="characterIcon('Traveler')"
          alt=""
          class="size-12 rounded-lg bg-surface-overlay object-cover"
        />
        <UiSegmented
          :model-value="travelerGender"
          :options="TRAVELER_OPTIONS"
          label="Traveler"
          @update:model-value="setTraveler"
        />
      </div>
    </UiPanel>

    <ImportKeyPanel :account="account" />

    <section class="rounded-xl border border-danger-border bg-surface-raised shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-4 p-5">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">Delete account</h2>
          <p class="tabular font-mono text-sm text-text-secondary">{{ loss }}</p>
        </div>
        <UiButton variant="danger" title="Exported GOOD files are not affected" @click="openDelete">
          <Trash2 class="size-4" aria-hidden="true" />
          Delete
        </UiButton>
      </div>
    </section>
  </div>

  <UiModal :open="deleteOpen" :title="`Delete ${name}?`" @close="deleteOpen = false">
    <form id="delete-account" class="flex flex-col gap-4" @submit.prevent="confirmDelete">
      <p class="text-text-secondary">
        Deletes <span class="tabular font-mono text-text-primary">{{ loss }}</span
        >. Its Irminsul key stops working.
      </p>
      <UiField v-slot="{ id }" :label="`Type ${confirmWord}`">
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
      <UiButton :disabled="deleting" @click="deleteOpen = false">Cancel</UiButton>
      <UiButton
        type="submit"
        form="delete-account"
        variant="danger"
        :loading="deleting"
        :disabled="!confirmed"
      >
        Delete
      </UiButton>
    </template>
  </UiModal>
</template>
