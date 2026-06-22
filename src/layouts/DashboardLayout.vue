<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'
import { useRouter, useRoute } from 'vue-router'
import { ref, onMounted, onUnmounted } from 'vue'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const router = useRouter()
const route = useRoute()

const myAccounts = ref<any[]>([])

const fetchMyAccounts = async () => {
  if (!authStore.token) return
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts`)
    if (res.ok) {
      const data = await res.json()
      myAccounts.value = data.data.edges || []
      
      // Auto-select first account if none is selected and accounts exist
      if (!genshinStore.selectedAccountId && myAccounts.value.length > 0) {
        genshinStore.selectAccount(myAccounts.value[0].id, myAccounts.value[0].accountName)
      }
    }
  } catch (err) {
    console.error(err)
  }
}



const handleLogout = () => {
  authStore.logout()
}

const navigationUser = [
  { name: 'Overview', path: '/dashboard' },
  { name: 'Accounts & Keys', path: '/dashboard/accounts' },
]

const navigationAccount = [
  { name: 'Overview', path: '/dashboard/account-overview' },
  { name: 'Detailed Progression', path: '/dashboard/account-detail' },
  { name: 'Snapshots', path: '/dashboard/account-snapshots' },
  { name: 'Characters', path: '/dashboard/characters' },
  { name: 'Artifacts', path: '/dashboard/artifacts' },
  { name: 'Export', path: '/dashboard/export' },
]

// ─── Import Logic ───
interface ImportFile {
  id: number;
  file: File;
  timestamp: string;
}

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const showModal = ref(false)
const selectedFiles = ref<ImportFile[]>([])
let fileIdCounter = 0
const isImporting = ref(false)
const importError = ref('')

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    Array.from(e.dataTransfer.files).forEach(processFile)
  }
}

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    Array.from(target.files).forEach(processFile)
  }
  // Reset so selecting the same file again triggers change event
  if (fileInput.value) fileInput.value.value = ''
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const processFile = (file: File) => {
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    alert(`File ${file.name} is not a valid JSON file.`)
    return
  }

  const importFile: ImportFile = {
    id: fileIdCounter++,
    file,
    timestamp: ''
  }
  
  const match = file.name.match(/genshin_export_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/)
  if (match && match[1] && match[2]) {
    importFile.timestamp = `${match[1]}T${match[2].replace(/-/g, ':')}`
  }
  
  selectedFiles.value.push(importFile)
  
  const reader = new FileReader()
  reader.onload = (e) => {
    if (importFile.timestamp) return // Prioritize filename timestamp
    try {
      const json = JSON.parse(e.target?.result as string)
      if (json.timestamp) {
        const ts = new Date(isNaN(Number(json.timestamp)) ? json.timestamp : Number(json.timestamp))
        if (!isNaN(ts.getTime())) {
          const offset = ts.getTimezoneOffset() * 60000
          const localISOTime = (new Date(ts.getTime() - offset)).toISOString().slice(0, 16)
          importFile.timestamp = localISOTime
        }
      }
    } catch (err) {
      console.warn(`Could not parse JSON to find timestamp for ${file.name}`)
    }
  }
  reader.readAsText(file)

  showModal.value = true
}

const removeFile = (id: number) => {
  selectedFiles.value = selectedFiles.value.filter(f => f.id !== id)
  if (selectedFiles.value.length === 0) {
    cancelImport()
  }
}

const clearTimestamp = (id: number) => {
  const f = selectedFiles.value.find(f => f.id === id)
  if (f) f.timestamp = ''
}

const cancelImport = () => {
  showModal.value = false
  selectedFiles.value = []
  importError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

const confirmImport = async () => {
  if (selectedFiles.value.length === 0 || !genshinStore.selectedAccountId) return
  
  isImporting.value = true
  importError.value = ''

  const formData = new FormData()
  const timestamps: (string | undefined)[] = []

  for (const importFile of selectedFiles.value) {
    formData.append('files', importFile.file)
    if (importFile.timestamp) {
      const localDate = new Date(importFile.timestamp)
      timestamps.push(localDate.toISOString())
    } else {
      timestamps.push(undefined)
    }
  }

  formData.append('timestamps', JSON.stringify(timestamps))

  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/import-bulk`, {
      method: 'POST',
      body: formData
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.message || 'Failed to import files')
    }

    const json = await res.json()
    const results = json.data.results || []

    const successCount = results.filter((r: any) => r.status === 'success').length
    const errors = results.filter((r: any) => r.status === 'error')

    if (successCount > 0) {
      genshinStore.triggerRefetch()
    }

    if (errors.length === 0) {
      alert('Import successful!')
      cancelImport()
    } else {
      selectedFiles.value = selectedFiles.value.filter(f => 
        errors.some((e: any) => e.filename === f.file.name)
      )
      importError.value = errors.map((e: any) => `[${e.filename}]: ${e.message}`).join('\n')
    }
  } catch (err: any) {
    importError.value = err.message || 'Import failed'
  } finally {
    isImporting.value = false
  }
}

onMounted(() => {
  fetchMyAccounts()
  window.addEventListener('dragover', handleDragOver)
  window.addEventListener('drop', handleDrop)
  window.addEventListener('dragleave', handleDragLeave)
})

onUnmounted(() => {
  window.removeEventListener('dragover', handleDragOver)
  window.removeEventListener('drop', handleDrop)
  window.removeEventListener('dragleave', handleDragLeave)
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex text-slate-900">
    <!-- Sidebar -->
    <aside class="w-64 bg-white border-r border-slate-200 flex flex-col">
      <div class="h-16 flex items-center px-6 border-b border-slate-200">
        <span class="text-xl font-bold text-slate-900 tracking-tight">GDT</span>
      </div>
      
      <div class="flex-1 overflow-y-auto py-6">
        <!-- USER SECTION -->
        <div class="px-4 mb-8">
          <h3 class="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</h3>
          <nav class="space-y-1">
            <router-link 
              v-for="item in navigationUser" 
              :key="item.name" 
              :to="item.path"
              class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
              :class="route.path === item.path ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'"
            >
              {{ item.name }}
            </router-link>
          </nav>
        </div>

        <!-- ACCOUNT SECTION -->
        <div class="px-4">
          <h3 class="px-3 mb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Account
          </h3>
          
          <div class="px-3 mb-4">
            <select 
              v-if="myAccounts.length > 0"
              :value="genshinStore.selectedAccountId"
              @change="(e: any) => {
                const id = Number(e.target.value)
                const acc = myAccounts.find(a => a.id === id)
                if (acc) genshinStore.selectAccount(acc.id, acc.accountName)
              }"
              class="w-full bg-slate-100 border border-slate-200 text-slate-800 text-sm rounded-md focus:ring-slate-900 focus:border-slate-900 block p-2 outline-none"
            >
              <option disabled value="">Select Account</option>
              <option v-for="acc in myAccounts" :key="acc.id" :value="acc.id">
                {{ acc.accountName }}
              </option>
            </select>
            <div v-else class="text-xs text-slate-400 italic">No accounts found</div>
          </div>

          <nav class="space-y-1">
            <template v-for="item in navigationAccount" :key="item.name">
              <router-link 
                v-if="genshinStore.selectedAccountId"
                :to="item.path"
                class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                :class="route.path === item.path ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'"
              >
                {{ item.name }}
              </router-link>
              <div 
                v-else
                class="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-400 cursor-not-allowed opacity-60"
                title="Select an account first"
              >
                {{ item.name }}
              </div>
            </template>
          </nav>
        </div>
      </div>
      
      <div class="p-4 border-t border-slate-200">
        <div class="flex items-center gap-3 mb-4 px-2">
          <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
            {{ authStore.user?.username.charAt(0).toUpperCase() }}
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-slate-900">{{ authStore.user?.username }}</span>
            <span class="text-xs text-slate-500">Admin</span>
          </div>
        </div>
        <button 
          @click="handleLogout"
          class="w-full flex justify-center items-center px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col overflow-hidden relative">
      <!-- Drop Overlay -->
      <div 
        v-if="isDragging" 
        class="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] border-4 border-dashed border-slate-400 flex items-center justify-center pointer-events-none"
      >
        <div class="bg-white px-8 py-4 rounded-xl shadow-xl flex flex-col items-center">
          <svg class="w-12 h-12 text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
          <p class="text-xl font-bold text-slate-700">Drop JSON file to import</p>
        </div>
      </div>

      <!-- Hidden File Input -->
      <input 
        type="file" 
        ref="fileInput" 
        accept=".json,application/json" 
        class="hidden" 
        multiple
        @change="handleFileSelect" 
      />

      <header class="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-semibold text-slate-900 capitalize">
            {{ route.name?.toString().replace('-', ' ') || 'Dashboard' }}
          </h1>
          <div v-if="genshinStore.selectedAccountId" class="h-4 w-px bg-slate-300"></div>
          <div v-if="genshinStore.selectedAccountId" class="text-sm text-slate-500 font-medium flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            {{ genshinStore.selectedAccountName }}
          </div>
        </div>
        
        <button 
          v-if="genshinStore.selectedAccountId"
          @click="triggerFileInput"
          class="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors"
        >
          Import Data
        </button>
      </header>
      
      <div class="flex-1 overflow-auto p-8 relative">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <!-- Import Modal -->
    <div v-if="showModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div class="p-6 border-b border-slate-100 shrink-0">
          <h3 class="text-xl font-bold text-slate-900 mb-1">Confirm Import</h3>
          <p class="text-sm text-slate-500">You are about to import {{ selectedFiles.length }} file(s).</p>
        </div>

        <div class="p-6 overflow-y-auto flex-1">
          <div v-if="importError" class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md whitespace-pre-wrap">
            {{ importError }}
          </div>

          <div class="space-y-4">
            <div 
              v-for="fileObj in selectedFiles" 
              :key="fileObj.id"
              class="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <div class="flex-1 truncate w-full">
                <p class="text-sm font-medium text-slate-800 truncate" :title="fileObj.file.name">
                  {{ fileObj.file.name }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <input 
                  v-model="fileObj.timestamp" 
                  type="datetime-local" 
                  class="px-2 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button 
                  @click="clearTimestamp(fileObj.id)"
                  class="p-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                  title="Clear Timestamp"
                >
                  Clear
                </button>
                <button 
                  @click="removeFile(fileObj.id)"
                  class="p-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
                  title="Remove File"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
          
          <button 
            @click="triggerFileInput"
            class="mt-4 w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            Add More Files
          </button>
        </div>

        <div class="p-6 border-t border-slate-100 shrink-0 flex justify-end gap-3">
          <button 
            @click="cancelImport"
            class="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
            :disabled="isImporting"
          >
            Cancel
          </button>
          <button 
            @click="confirmImport"
            class="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
            :disabled="isImporting"
          >
            <span v-if="isImporting" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            {{ isImporting ? 'Importing...' : 'Submit' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
