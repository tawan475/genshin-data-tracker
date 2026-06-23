<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseButton from '../../components/BaseButton.vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import { swalToast } from '../../utils/swal'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const accounts = ref<any[]>([])
const isLoading = ref(true)
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

// For displaying the newly generated key
const generatedKey = ref<{ accountId: number, key: string } | null>(null)

// Edit state
const editingId = ref<number | null>(null)
const editForm = ref({ accountName: '', uid: '', server: '' })

// Delete state
const deletingId = ref<number | null>(null)
const deleteConfirmName = ref('')
const deleteError = ref('')

const fetchAccounts = async () => {
  isLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts`)
    
    if (res.status === 401) {
      return
    }

    const data = await res.json()
    if (res.ok) {
      accounts.value = data.data.edges || []
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
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountName: newAccountName.value,
        uid: newAccountUid.value,
        server: newAccountServer.value
      })
    })
    
    if (res.status === 401) {
      return
    }
    
    if (res.ok) {
      newAccountName.value = ''
      newAccountUid.value = ''
      await fetchAccounts()
      genshinStore.triggerAccountsRefetch()
    }
  } finally {
    creating.value = false
  }
}

const generateKey = async (accountId: number) => {
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${accountId}/import-key`, {
      method: 'POST'
    })
    
    if (res.status === 401) {
      return
    }

    const data = await res.json()
    if (res.ok) {
      generatedKey.value = { accountId, key: data.data.importKey }
      await fetchAccounts() // Refresh to update hasImportKey status
    }
  } catch (err) {
    console.error(err)
  }
}

const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text)
  swalToast('Import key copied to clipboard!', 'success')
}

// Editing
const startEdit = (acc: any) => {
  editingId.value = acc.id
  editForm.value = { accountName: acc.accountName, uid: acc.uid || '', server: acc.server }
}

const cancelEdit = () => {
  editingId.value = null
}

const saveEdit = async (id: number) => {
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountName: editForm.value.accountName,
        uid: editForm.value.uid,
        server: editForm.value.server
      })
    })
    if (res.ok) {
      editingId.value = null
      await fetchAccounts()
      genshinStore.triggerAccountsRefetch()
    }
  } catch (err) {
    console.error(err)
  }
}

// Deleting
const startDelete = (id: number) => {
  deletingId.value = id
  deleteConfirmName.value = ''
  deleteError.value = ''
}

const cancelDelete = () => {
  deletingId.value = null
}

const confirmDelete = async (id: number) => {
  deleteError.value = ''
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName: deleteConfirmName.value })
    })
    if (res.ok) {
      deletingId.value = null
      await fetchAccounts()
      genshinStore.triggerAccountsRefetch()
    } else {
      const data = await res.json()
      deleteError.value = data.message || 'Nickname mismatch.'
    }
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  fetchAccounts()
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-8 pb-12">
    
    <!-- Add New Account Form -->
    <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4 transition-colors">Add Genshin Account</h2>
      <form @submit.prevent="handleCreateAccount" class="flex flex-col md:flex-row gap-4 items-end">
        <div class="flex-1 w-full">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 transition-colors">Account Nickname *</label>
          <input 
            v-model="newAccountName" 
            type="text" 
            required
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
            placeholder="e.g. Main Account"
          >
        </div>
        <div class="w-full md:w-32">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 transition-colors">UID (Optional)</label>
          <input 
            v-model="newAccountUid" 
            type="text" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
            placeholder="800000000"
          >
        </div>
        <div class="w-full md:w-48">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 transition-colors">Server</label>
          <select 
            v-model="newAccountServer" 
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 text-sm transition-colors"
          >
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <BaseButton 
          type="submit"
          :loading="creating"
          :disabled="!newAccountName.trim()"
          class="w-full sm:w-auto"
        >
          Add Account
        </BaseButton>
      </form>
    </section>

    <!-- Accounts List -->
    <section class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
      <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 transition-colors">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white transition-colors">Your Accounts</h2>
      </div>
      
      <div v-if="isLoading" class="p-6 text-center text-slate-500 dark:text-slate-400 transition-colors">
        Loading accounts...
      </div>
      
      <div v-else-if="accounts.length === 0" class="p-8 text-center text-slate-500 dark:text-slate-400 transition-colors">
        You haven't added any Genshin accounts yet.
      </div>
      
      <ul v-else class="divide-y divide-slate-200 dark:divide-slate-700 transition-colors">
        <li v-for="acc in accounts" :key="acc.id" class="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
          
          <!-- View Mode -->
          <div v-if="editingId !== acc.id && deletingId !== acc.id" class="flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
            <div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-white transition-colors">{{ acc.accountName }}</h3>
              <div class="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 transition-colors">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300 transition-colors">
                  {{ serverOptions[acc.server] || acc.server }}
                </span>
                <span>UID: {{ acc.uid || 'Not set' }}</span>
              </div>
            </div>
            
            <div class="flex flex-col items-end gap-2 w-full sm:w-auto">
              <template v-if="generatedKey?.accountId === acc.id">
                <div class="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-400 px-3 py-2 rounded-md text-sm w-full transition-colors">
                  <code class="font-mono flex-1 select-all break-all">{{ generatedKey?.key }}</code>
                  <BaseButton variant="ghost" size="xs" @click="copyToClipboard(generatedKey?.key || '')" class="!text-emerald-600 dark:!text-emerald-500 hover:!bg-emerald-50 dark:hover:!bg-emerald-900/20">Copy</BaseButton>
                </div>
                <p class="text-xs text-amber-600 dark:text-amber-500 transition-colors">This key will only be shown once!</p>
              </template>
              <template v-else>
                <div class="flex items-center gap-2">
                  <button 
                    v-if="genshinStore.selectedAccountId === acc.id"
                    class="px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded cursor-default transition-colors"
                  >
                    Selected
                  </button>
                  <button 
                    v-else
                    @click="genshinStore.selectAccount(acc.id, acc.accountName)"
                    class="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Select
                  </button>

                  <BaseButton variant="outline" size="xs" @click="startEdit(acc)">Edit</BaseButton>
                  <BaseButton variant="danger-outline" size="xs" @click="startDelete(acc.id)">Delete</BaseButton>
                  <BaseButton 
                    variant="primary"
                    size="xs"
                    @click="generateKey(acc.id)" 
                  >
                    {{ acc.importKeyHash ? 'Regenerate Key' : 'Generate Key' }}
                  </BaseButton>
                </div>
              </template>
            </div>
          </div>

          <!-- Edit Mode -->
          <div v-else-if="editingId === acc.id" class="flex flex-col gap-4">
            <h3 class="text-sm font-bold text-slate-900 dark:text-white transition-colors">Edit Account</h3>
            <div class="flex flex-col sm:flex-row gap-4 items-start">
              <div class="flex-1 w-full">
                <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1 transition-colors">Nickname</label>
                <input v-model="editForm.accountName" type="text" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md text-sm transition-colors">
              </div>
              <div class="w-full sm:w-32">
                <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1 transition-colors">UID</label>
                <input v-model="editForm.uid" type="text" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md text-sm transition-colors">
              </div>
              <div class="w-full sm:w-48">
                <label class="block text-xs text-slate-500 dark:text-slate-400 mb-1 transition-colors">Server</label>
                <select v-model="editForm.server" class="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md text-sm transition-colors">
                  <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">{{ displayValue }}</option>
                </select>
              </div>
            </div>
            <div class="mt-4 flex justify-end gap-3">
              <BaseButton variant="outline" @click="cancelEdit">Cancel</BaseButton>
              <BaseButton @click="saveEdit(acc.id)">Save Changes</BaseButton>
            </div>
          </div>

          <!-- Delete Mode -->
          <div v-else-if="deletingId === acc.id" class="flex flex-col gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg transition-colors">
            <h3 class="text-sm font-bold text-red-800 dark:text-red-400 transition-colors">Delete Account?</h3>
            <p class="text-sm text-red-700 dark:text-red-300 transition-colors">This action cannot be undone. To verify, type <strong>{{ acc.accountName }}</strong> below:</p>
            <input v-model="deleteConfirmName" type="text" placeholder="Type nickname here" class="px-3 py-2 border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md text-sm focus:ring-red-500 dark:focus:ring-red-500 focus:border-red-500 dark:focus:border-red-500 w-full max-w-sm transition-colors">
            <p v-if="deleteError" class="text-xs text-red-600 dark:text-red-400 font-bold transition-colors">{{ deleteError }}</p>
            <div class="mt-6 flex justify-end gap-3">
              <BaseButton variant="outline" @click="cancelDelete">Cancel</BaseButton>
              <BaseButton 
                variant="danger"
                :disabled="deleteConfirmName !== acc.accountName"
                @click="confirmDelete(acc.id)" 
              >
                Permanently Delete
              </BaseButton>
            </div>
          </div>

        </li>
      </ul>
    </section>

  </div>
</template>
