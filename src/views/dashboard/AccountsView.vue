<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'

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
        uid: newAccountUid.value || undefined,
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
  alert('Import key copied to clipboard!')
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
        uid: editForm.value.uid || undefined,
        server: editForm.value.server
      })
    })
    if (res.ok) {
      editingId.value = null
      await fetchAccounts()
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
    <section class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">Add Genshin Account</h2>
      <form @submit.prevent="handleCreateAccount" class="flex flex-col md:flex-row gap-4 items-end">
        <div class="flex-1 w-full">
          <label class="block text-sm font-medium text-slate-700 mb-1">Account Nickname *</label>
          <input 
            v-model="newAccountName" 
            type="text" 
            required
            class="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm"
            placeholder="e.g. Main Account"
          >
        </div>
        <div class="w-full md:w-32">
          <label class="block text-sm font-medium text-slate-700 mb-1">UID (Optional)</label>
          <input 
            v-model="newAccountUid" 
            type="text" 
            class="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm"
            placeholder="800000000"
          >
        </div>
        <div class="w-full md:w-48">
          <label class="block text-sm font-medium text-slate-700 mb-1">Server</label>
          <select 
            v-model="newAccountServer" 
            class="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 text-sm bg-white"
          >
            <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">
              {{ displayValue }}
            </option>
          </select>
        </div>
        <button 
          type="submit" 
          :disabled="creating"
          class="w-full md:w-auto px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors disabled:opacity-50"
        >
          {{ creating ? 'Adding...' : 'Add Account' }}
        </button>
      </form>
    </section>

    <!-- Accounts List -->
    <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <h2 class="text-base font-semibold text-slate-900">Your Accounts</h2>
      </div>
      
      <div v-if="isLoading" class="p-6 text-center text-slate-500">
        Loading accounts...
      </div>
      
      <div v-else-if="accounts.length === 0" class="p-8 text-center text-slate-500">
        You haven't added any Genshin accounts yet.
      </div>
      
      <ul v-else class="divide-y divide-slate-200">
        <li v-for="acc in accounts" :key="acc.id" class="p-6 hover:bg-slate-50 transition-colors">
          
          <!-- View Mode -->
          <div v-if="editingId !== acc.id && deletingId !== acc.id" class="flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
            <div>
              <h3 class="text-sm font-bold text-slate-900">{{ acc.accountName }}</h3>
              <div class="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                  {{ serverOptions[acc.server] || acc.server }}
                </span>
                <span>UID: {{ acc.uid || 'Not set' }}</span>
              </div>
            </div>
            
            <div class="flex flex-col items-end gap-2 w-full sm:w-auto">
              <template v-if="generatedKey?.accountId === acc.id">
                <div class="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-md text-sm w-full">
                  <code class="font-mono flex-1 select-all break-all">{{ generatedKey?.key }}</code>
                  <button @click="copyToClipboard(generatedKey?.key || '')" class="text-green-600 hover:text-green-800 font-medium">Copy</button>
                </div>
                <p class="text-xs text-amber-600">This key will only be shown once!</p>
              </template>
              <template v-else>
                <div class="flex items-center gap-2">
                  <button 
                    v-if="genshinStore.selectedAccountId === acc.id"
                    class="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded cursor-default"
                  >
                    Selected
                  </button>
                  <button 
                    v-else
                    @click="genshinStore.selectAccount(acc.id, acc.accountName)"
                    class="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200 transition-colors"
                  >
                    Select
                  </button>
                  
                  <button @click="startEdit(acc)" class="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-100">Edit</button>
                  <button @click="startDelete(acc.id)" class="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
                  <button 
                    @click="generateKey(acc.id)"
                    class="px-4 py-1.5 bg-white border border-slate-300 rounded-md shadow-sm text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors"
                  >
                    {{ acc.importKeyHash ? 'Regenerate Key' : 'Generate Key' }}
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- Edit Mode -->
          <div v-else-if="editingId === acc.id" class="flex flex-col gap-4">
            <h3 class="text-sm font-bold text-slate-900 mb-2">Edit Account</h3>
            <div class="flex flex-col sm:flex-row gap-4 items-start">
              <div class="flex-1 w-full">
                <label class="block text-xs text-slate-500 mb-1">Nickname</label>
                <input v-model="editForm.accountName" type="text" class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm">
              </div>
              <div class="w-full sm:w-32">
                <label class="block text-xs text-slate-500 mb-1">UID</label>
                <input v-model="editForm.uid" type="text" class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm">
              </div>
              <div class="w-full sm:w-48">
                <label class="block text-xs text-slate-500 mb-1">Server</label>
                <select v-model="editForm.server" class="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white">
                  <option v-for="(displayValue, key) in serverOptions" :key="key" :value="key">{{ displayValue }}</option>
                </select>
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-2">
              <button @click="cancelEdit" class="px-4 py-1.5 text-sm border border-slate-300 rounded-md hover:bg-slate-100">Cancel</button>
              <button @click="saveEdit(acc.id)" class="px-4 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-800">Save Changes</button>
            </div>
          </div>

          <!-- Delete Mode -->
          <div v-else-if="deletingId === acc.id" class="flex flex-col gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 class="text-sm font-bold text-red-800">Delete Account?</h3>
            <p class="text-sm text-red-700">This action cannot be undone. To verify, type <strong>{{ acc.accountName }}</strong> below:</p>
            <input v-model="deleteConfirmName" type="text" placeholder="Type nickname here" class="px-3 py-2 border border-red-300 rounded-md text-sm focus:ring-red-500 focus:border-red-500 w-full max-w-sm">
            <p v-if="deleteError" class="text-xs text-red-600 font-bold">{{ deleteError }}</p>
            <div class="flex items-center gap-2 mt-2">
              <button @click="cancelDelete" class="px-4 py-1.5 text-sm border border-slate-300 bg-white rounded-md hover:bg-slate-50">Cancel</button>
              <button 
                @click="confirmDelete(acc.id)" 
                :disabled="deleteConfirmName !== acc.accountName"
                class="px-4 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Permanently Delete
              </button>
            </div>
          </div>

        </li>
      </ul>
    </section>

  </div>
</template>
