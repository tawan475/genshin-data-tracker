<script setup lang="ts">
import type { AccountResponse, GenshinServer } from '@gdt/shared'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/legacy/BaseButton.vue'
import BaseModal from '@/components/legacy/BaseModal.vue'
import BaseTable, { type TableLabel } from '@/components/legacy/BaseTable.vue'
import DeleteAccountModal from '@/components/user/DeleteAccountModal.vue'
import ImportKeyModal from '@/components/user/ImportKeyModal.vue'
import { SERVER_OPTIONS } from '@/components/user/servers'
import { api, ApiRequestError } from '@/api'
import { validateAccountForm, type AccountFormErrors } from '@/data/import-setup'
import { lastAccountId, useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'

/** The original "Accounts & Keys": add, edit, delete accounts and their import keys. */
const accounts = useAccounts()
const feedback = useFeedback()
const router = useRouter()

const serverOptions = SERVER_OPTIONS

const tableLabels: TableLabel[] = [
  { key: 'id', title: 'ID' },
  { key: 'accountName', title: 'Nickname', slot: true },
  { key: 'uid', title: 'UID', slot: true },
  { key: 'server', title: 'Server', slot: true },
  { key: 'status', title: 'Status', slot: true },
  { key: 'actions', title: 'Actions', slot: true },
]

/** The account the sidebar shows when no account page is open. */
const selectedId = computed(() => {
  const last = lastAccountId()
  return last && accounts.byId.has(last) ? last : (accounts.list[0]?.id ?? null)
})

const selectAccount = (id: number) =>
  router.push({ name: 'account-overview', params: { accountId: id } })

/** Field errors the server reported (it validates with the same schema). */
function serverIssues(error: unknown): AccountFormErrors {
  if (!(error instanceof ApiRequestError)) return {}
  return { name: error.issueFor('name'), uid: error.issueFor('uid') }
}

const inputClass =
  'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors'

// ------------------------------------------------------------------- add

const showAddModal = ref(false)
const newAccountName = ref('')
const newAccountUid = ref('')
const newAccountServer = ref<GenshinServer>('ASIA')
const addErrors = ref<AccountFormErrors>({})
const creating = ref(false)

function openAdd() {
  addErrors.value = {}
  showAddModal.value = true
}

async function handleCreateAccount() {
  if (!newAccountName.value.trim()) return
  const result = validateAccountForm({
    name: newAccountName.value,
    uid: newAccountUid.value,
    server: newAccountServer.value,
  })
  if (!result.ok) {
    addErrors.value = result.errors
    return
  }
  addErrors.value = {}
  creating.value = true
  try {
    const created = await accounts.create(result.input)
    newAccountName.value = ''
    newAccountUid.value = ''
    newAccountServer.value = 'ASIA'
    showAddModal.value = false
    generatedKey.value = created.importKey
  } catch (error) {
    addErrors.value = serverIssues(error)
    feedback.error('Failed to add account', error)
  } finally {
    creating.value = false
  }
}

// ------------------------------------------------------------------ edit

const showEditModal = ref(false)
const editingId = ref<number | null>(null)
const editForm = ref<{ accountName: string; uid: string; server: GenshinServer | null }>({
  accountName: '',
  uid: '',
  server: null,
})
/** An account saved without a server keeps that choice available. */
const editHadNoServer = ref(false)
const editErrors = ref<AccountFormErrors>({})
const isSaving = ref(false)

function startEdit(account: AccountResponse) {
  editingId.value = account.id
  editForm.value = {
    accountName: account.name ?? '',
    uid: account.uid ?? '',
    server: account.server,
  }
  editHadNoServer.value = account.server === null
  editErrors.value = {}
  showEditModal.value = true
}

async function saveEdit() {
  if (editingId.value === null) return
  const result = validateAccountForm({
    name: editForm.value.accountName,
    uid: editForm.value.uid,
    server: editForm.value.server,
  })
  if (!result.ok) {
    editErrors.value = result.errors
    return
  }
  editErrors.value = {}
  isSaving.value = true
  try {
    await accounts.update(editingId.value, result.input)
    showEditModal.value = false
    editingId.value = null
    feedback.toast({ tone: 'success', title: 'Account updated' })
  } catch (error) {
    editErrors.value = serverIssues(error)
    feedback.error('Failed to update account', error)
  } finally {
    isSaving.value = false
  }
}

// ---------------------------------------------------------------- delete

const deleting = ref<AccountResponse | null>(null)

// ------------------------------------------------------------ import key

const generatingKeyFor = ref<number | null>(null)
/** Shown once in "Import Key Generated", after creating an account or rotating its key. */
const generatedKey = ref<string | null>(null)

async function generateKey(accountId: number) {
  generatingKeyFor.value = accountId
  try {
    const { importKey } = await api.rotateImportKey(accountId)
    generatedKey.value = importKey
  } catch (error) {
    feedback.error('Failed to generate key', error)
  } finally {
    generatingKeyFor.value = null
  }
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 pb-12">
    <!-- Accounts Header -->
    <div class="flex justify-between items-center gap-3 bg-transparent transition-colors mb-4">
      <h2 class="text-xl font-bold text-slate-900 dark:text-white transition-colors">
        Your Accounts
      </h2>
      <BaseButton variant="primary" size="sm" @click="openAdd">Add Account</BaseButton>
    </div>

    <!-- Accounts List -->
    <BaseTable :labels="tableLabels" :data="accounts.list" :is-loading="!accounts.loaded">
      <template #accountName="{ item }">
        <span v-if="item.name" class="break-words">{{ item.name }}</span>
        <span v-else class="text-slate-400 text-xs">Not set</span>
      </template>

      <!-- UID Slot -->
      <template #uid="{ item }">
        {{ item.uid || 'Not set' }}
      </template>

      <!-- Server Slot -->
      <template #server="{ item }">
        <span
          v-if="item.server"
          class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300 transition-colors"
        >
          {{ serverOptions[item.server as GenshinServer] || item.server }}
        </span>
        <span v-else class="text-slate-400 text-xs">Not set</span>
      </template>

      <!-- Status Slot -->
      <template #status="{ item }">
        <button
          v-if="selectedId === item.id"
          type="button"
          class="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded cursor-default transition-colors"
        >
          Selected
        </button>
        <button
          v-else
          type="button"
          class="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          @click="selectAccount(item.id)"
        >
          Select
        </button>
      </template>

      <!-- Actions Slot -->
      <template #actions="{ item }">
        <div class="flex items-center gap-2">
          <BaseButton variant="outline" size="xs" @click="startEdit(item)">Edit</BaseButton>
          <BaseButton variant="danger-outline" size="xs" @click="deleting = item">
            Delete
          </BaseButton>
          <BaseButton
            variant="primary"
            size="xs"
            class="whitespace-nowrap"
            :loading="generatingKeyFor === item.id"
            @click="generateKey(item.id)"
          >
            Regen Key
          </BaseButton>
        </div>
      </template>

      <template #empty> You haven't added any Genshin accounts yet. </template>
    </BaseTable>

    <!-- Add Account Modal -->
    <BaseModal v-model="showAddModal" title="Add Genshin Account">
      <form class="p-6 space-y-4" novalidate @submit.prevent="handleCreateAccount">
        <div>
          <label
            for="add-account-name"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >Account Nickname *</label
          >
          <input
            id="add-account-name"
            v-model="newAccountName"
            type="text"
            required
            maxlength="64"
            :class="inputClass"
            placeholder="e.g. Main Account"
          />
          <p v-if="addErrors.name" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ addErrors.name }}
          </p>
        </div>
        <div>
          <label
            for="add-account-uid"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >UID (Optional)</label
          >
          <input
            id="add-account-uid"
            v-model="newAccountUid"
            type="text"
            inputmode="numeric"
            :class="inputClass"
            placeholder="800000000"
          />
          <p v-if="addErrors.uid" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ addErrors.uid }}
          </p>
        </div>
        <div>
          <label
            for="add-account-server"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >Server</label
          >
          <select id="add-account-server" v-model="newAccountServer" :class="inputClass">
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <div
          class="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 mt-6"
        >
          <BaseButton variant="outline" type="button" @click="showAddModal = false">
            Cancel
          </BaseButton>
          <BaseButton type="submit" :loading="creating" :disabled="!newAccountName.trim()">
            Add Account
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- Edit Account Modal -->
    <BaseModal v-model="showEditModal" title="Edit Account">
      <form class="p-6 space-y-4" novalidate @submit.prevent="saveEdit">
        <div>
          <label
            for="edit-account-name"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >Nickname *</label
          >
          <input
            id="edit-account-name"
            v-model="editForm.accountName"
            type="text"
            required
            maxlength="64"
            :class="inputClass"
          />
          <p v-if="editErrors.name" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ editErrors.name }}
          </p>
        </div>
        <div>
          <label
            for="edit-account-uid"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >UID (Optional)</label
          >
          <input
            id="edit-account-uid"
            v-model="editForm.uid"
            type="text"
            inputmode="numeric"
            :class="inputClass"
          />
          <p v-if="editErrors.uid" class="mt-1 text-xs text-red-600 dark:text-red-400">
            {{ editErrors.uid }}
          </p>
        </div>
        <div>
          <label
            for="edit-account-server"
            class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >Server</label
          >
          <select id="edit-account-server" v-model="editForm.server" :class="inputClass">
            <option v-if="editHadNoServer" :value="null">Not set</option>
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <div
          class="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 mt-6"
        >
          <BaseButton
            variant="outline"
            type="button"
            :disabled="isSaving"
            @click="showEditModal = false"
          >
            Cancel
          </BaseButton>
          <BaseButton type="submit" :loading="isSaving" :disabled="!editForm.accountName.trim()">
            Save Changes
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <DeleteAccountModal :account="deleting" @close="deleting = null" />
    <ImportKeyModal :import-key="generatedKey" @close="generatedKey = null" />
  </div>
</template>
