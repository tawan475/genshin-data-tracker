<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseButton from '../../components/BaseButton.vue'
import BaseModal from '../../components/BaseModal.vue'
import BaseTable from '../../components/BaseTable.vue'
import type { TableLabel } from '../../components/BaseTable.vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import { swalToast } from '../../utils/swal'
import Swal from 'sweetalert2'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const accounts = ref<any[]>([])
const isLoading = ref(true)
const meta = ref({ page: 1, limit: 10, totalPages: 1, total: 0 })
const newAccountName = ref('')
const newAccountUid = ref('')
const newAccountServer = ref('ASIA')
const creating = ref(false)
const serverOptions = ref<Record<string, string>>({
  ASIA: 'Asia',
  AMERICA: 'America',
  EUROPE: 'Europe',
  SAR: 'TW/HK/MO'
})

const showAddModal = ref(false)

// Edit state
const showEditModal = ref(false)
const editingId = ref<number | null>(null)
const isSaving = ref(false)
const generatingKeyFor = ref<number | null>(null)
const editForm = ref({ accountName: '', uid: '', server: '', isGlobalArtifactRankingOptIn: false })

const tableLabels: TableLabel[] = [
  { key: 'id', title: 'ID' },
  { key: 'accountName', title: 'Nickname' },
  { key: 'uid', title: 'UID', slot: true },
  { key: 'server', title: 'Server', slot: true },
  { key: 'globalRanking', title: 'Global Ranking', slot: true },
  { key: 'status', title: 'Status', slot: true },
  { key: 'actions', title: 'Actions', slot: true }
]

const fetchAccounts = async (page = 1) => {
  isLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts?page=${page}&limit=${meta.value.limit}`)
    if (res.status === 401) return
    const data = await res.json()
    if (res.ok) {
      accounts.value = data.data.edges || []
      meta.value = data.data.meta || { page: 1, limit: meta.value.limit, totalPages: 1, total: 0 }
      if (data.data.enum?.servers) {
        serverOptions.value = data.data.enum.servers
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const handleCreateAccount = async () => {
  if (!newAccountName.value) return
  creating.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountName: newAccountName.value,
        uid: newAccountUid.value,
        server: newAccountServer.value
      })
    })
    if (res.status === 401) return
    if (res.ok) {
      newAccountName.value = ''
      newAccountUid.value = ''
      showAddModal.value = false
      await fetchAccounts()
      genshinStore.triggerAccountsRefetch()
    }
  } finally {
    creating.value = false
  }
}

const generateKey = async (accountId: number) => {
  generatingKeyFor.value = accountId
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${accountId}/import-key`, {
      method: 'POST'
    })
    if (res.status === 401) return
    const data = await res.json()
    if (res.ok) {
      await fetchAccounts()
      const generatedKey = data.data.importKey
      Swal.fire({
        title: 'Import Key Generated',
        html: `
          <div class="mb-2">Your new import key is:</div>
          <code class="font-mono bg-slate-100 dark:bg-slate-700 p-2 rounded block select-all break-all text-slate-900 dark:text-slate-100">${generatedKey}</code>
          <div class="text-xs text-amber-500 mt-2">This key will only be shown once!</div>
        `,
        icon: 'success',
        confirmButtonText: 'Copy to Clipboard'
      }).then((result) => {
        if (result.isConfirmed) {
          copyToClipboard(generatedKey)
        }
      })
    }
  } catch (err) {
    console.error(err)
  } finally {
    generatingKeyFor.value = null
  }
}

const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text)
  swalToast('Copied to clipboard!', 'success')
}

// Editing
const startEdit = (acc: any) => {
  editingId.value = acc.id
  editForm.value = { 
    accountName: acc.accountName, 
    uid: acc.uid || '', 
    server: acc.server, 
    isGlobalArtifactRankingOptIn: acc.isGlobalArtifactRankingOptIn || false 
  }
  showEditModal.value = true
}

const saveEdit = async () => {
  if (!editingId.value) return
  isSaving.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${editingId.value}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountName: editForm.value.accountName,
        uid: editForm.value.uid,
        server: editForm.value.server,
        isGlobalArtifactRankingOptIn: editForm.value.isGlobalArtifactRankingOptIn
      })
    })
    if (res.ok) {
      showEditModal.value = false
      editingId.value = null
      await fetchAccounts()
      genshinStore.triggerAccountsRefetch()
      swalToast('Account updated', 'success')
    }
  } catch (err) {
    console.error(err)
  } finally {
    isSaving.value = false
  }
}

// Deleting
const startDelete = async (acc: any) => {
  const result = await Swal.fire({
    title: 'Delete Account?',
    html: `This action cannot be undone. To verify, type <strong>${acc.accountName}</strong> below:`,
    input: 'text',
    inputPlaceholder: acc.accountName,
    showCancelButton: true,
    confirmButtonText: 'Permanently Delete',
    confirmButtonColor: '#ef4444',
    showLoaderOnConfirm: true,
    preConfirm: async (inputValue) => {
      if (inputValue !== acc.accountName) {
        Swal.showValidationMessage('Account nickname does not match')
        return false
      }
      try {
        const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${acc.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountName: inputValue })
        })
        if (res.ok) {
          await fetchAccounts()
          genshinStore.triggerAccountsRefetch()
          return true
        } else {
          const data = await res.json()
          Swal.showValidationMessage(data.message || 'Failed to delete account')
          return false
        }
      } catch (err: any) {
        Swal.showValidationMessage(`Request failed: ${err.message}`)
        return false
      }
    },
    allowOutsideClick: () => !Swal.isLoading()
  })

  if (result.isConfirmed) {
    swalToast('Account deleted', 'success')
  }
}

onMounted(() => {
  fetchAccounts()
})
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 pb-12">
    <!-- Accounts Header -->
    <div class="flex justify-between items-center bg-transparent transition-colors mb-4">
      <h2 class="text-xl font-bold text-slate-900 dark:text-white transition-colors">Your Accounts</h2>
      <BaseButton @click="showAddModal = true" variant="primary" size="sm">Add Account</BaseButton>
    </div>

    <!-- Accounts List -->
    <BaseTable :labels="tableLabels" :data="accounts" :is-loading="isLoading" :meta="meta" @page-change="fetchAccounts">
          <!-- UID Slot -->
          <template #uid="{ item }">
            {{ item.uid || 'Not set' }}
          </template>

          <!-- Server Slot -->
          <template #server="{ item }">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300 transition-colors">
              {{ serverOptions[item.server] || item.server }}
            </span>
          </template>

          <!-- Global Ranking Slot -->
          <template #globalRanking="{ item }">
            <span v-if="item.isGlobalArtifactRankingOptIn" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 transition-colors">
              Opted In
            </span>
            <span v-else class="text-slate-400 text-xs">Not Opted In</span>
          </template>

          <!-- Status Slot -->
          <template #status="{ item }">
            <button 
              v-if="genshinStore.selectedAccountId === item.id"
              class="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded cursor-default transition-colors"
            >
              Selected
            </button>
            <button 
              v-else
              @click="genshinStore.selectAccount(item.id, item.accountName)"
              class="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              Select
            </button>
          </template>

          <!-- Actions Slot -->
          <template #actions="{ item }">
            <div class="flex items-center gap-2">
              <BaseButton variant="outline" size="xs" @click="startEdit(item)">Edit</BaseButton>
              <BaseButton variant="danger-outline" size="xs" @click="startDelete(item)">Delete</BaseButton>
              <BaseButton 
                variant="primary"
                size="xs"
                :loading="generatingKeyFor === item.id"
                @click="generateKey(item.id)" 
              >
                {{ item.importKeyHash ? 'Regen Key' : 'Gen Key' }}
              </BaseButton>
            </div>
          </template>

          <template #empty>
            You haven't added any Genshin accounts yet.
          </template>
        </BaseTable>

    <!-- Add Account Modal -->
    <BaseModal v-model="showAddModal" title="Add Genshin Account">
      <form @submit.prevent="handleCreateAccount" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account Nickname *</label>
          <input 
            v-model="newAccountName" 
            type="text" 
            required
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
            placeholder="e.g. Main Account"
          >
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">UID (Optional)</label>
          <input 
            v-model="newAccountUid" 
            type="text" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
            placeholder="800000000"
          >
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Server</label>
          <select 
            v-model="newAccountServer" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
          >
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <div class="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 mt-6">
          <BaseButton variant="outline" @click="showAddModal = false" type="button">Cancel</BaseButton>
          <BaseButton 
            type="submit"
            :loading="creating"
            :disabled="!newAccountName.trim()"
          >
            Add Account
          </BaseButton>
        </div>
      </form>
    </BaseModal>

    <!-- Edit Account Modal -->
    <BaseModal v-model="showEditModal" title="Edit Account">
      <form @submit.prevent="saveEdit" class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nickname *</label>
          <input 
            v-model="editForm.accountName" 
            type="text" 
            required
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
          >
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">UID (Optional)</label>
          <input 
            v-model="editForm.uid" 
            type="text" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
          >
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Server</label>
          <select 
            v-model="editForm.server" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
          >
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <div class="flex items-center mt-2">
          <input 
            id="optin-checkbox-edit"
            v-model="editForm.isGlobalArtifactRankingOptIn" 
            type="checkbox" 
            class="w-4 h-4 text-slate-900 bg-slate-100 border-slate-300 rounded focus:ring-slate-900 dark:focus:ring-slate-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
          >
          <label for="optin-checkbox-edit" class="ml-2 text-sm font-medium text-slate-900 dark:text-slate-300">
            Participate in Global Artifact Leaderboard
          </label>
        </div>
        <div class="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700 mt-6">
          <BaseButton variant="outline" @click="showEditModal = false" type="button" :disabled="isSaving">Cancel</BaseButton>
          <BaseButton type="submit" :loading="isSaving">
            Save Changes
          </BaseButton>
        </div>
      </form>
    </BaseModal>

  </div>
</template>
