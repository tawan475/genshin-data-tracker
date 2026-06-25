<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'
import { useSettingsStore } from '../stores/settings'
import { useRouter, useRoute } from 'vue-router'
import ImportModal from '../components/ImportModal.vue'
import { ref, onMounted, onUnmounted, watch, provide } from 'vue'
import { IMPORT_FLOW_KEY, useImportFlow } from '../composables/useImportFlow'
import { Icon } from '@iconify/vue'
import BaseButton from '../components/BaseButton.vue'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const route = useRoute()

const myAccounts = ref<any[]>([])

const isLoadingNav = ref(true)

const fetchMyAccounts = async () => {
  if (!authStore.token) return
  isLoadingNav.value = true
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
  } finally {
    isLoadingNav.value = false
  }
}

watch(() => genshinStore.accountsRefetchTrigger, () => {
  fetchMyAccounts()
})



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
  { name: 'Materials', path: '/dashboard/materials' },
  { name: 'Export', path: '/dashboard/export' },
]

const importFlow = useImportFlow()
provide(IMPORT_FLOW_KEY, importFlow)

const isDragging = ref(false)

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()

  if (e.dataTransfer?.items) {
    const hasJson = Array.from(e.dataTransfer.items).some(
      item => item.kind === 'file' && (item.type === 'application/json' || item.type === '')
    )
    if (hasJson) {
      isDragging.value = true
    }
  }
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const validFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/json' || f.name.endsWith('.json')
    )
    validFiles.forEach((f) => {
      if (importFlow.addFileToQueue(f)) {
        importFlow.showModal.value = true
      }
    })
  }
}

onMounted(() => {
  fetchMyAccounts()
  window.addEventListener('dragover', handleDragOver)
  window.addEventListener('drop', handleDrop)
  window.addEventListener('dragleave', handleDragLeave)
  window.addEventListener('paste', importFlow.handleGlobalPaste)
})

onUnmounted(() => {
  window.removeEventListener('dragover', handleDragOver)
  window.removeEventListener('drop', handleDrop)
  window.removeEventListener('dragleave', handleDragLeave)
  window.removeEventListener('paste', importFlow.handleGlobalPaste)
})
</script>

<template>
  <div class="h-screen w-full bg-slate-50 dark:bg-slate-900 flex text-slate-900 dark:text-slate-100 overflow-hidden relative">
    
    <!-- Page-wide loading screen -->
    <div v-if="isLoadingNav" class="absolute inset-0 z-[200] bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
      <span class="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-slate-900 dark:border-t-slate-100 rounded-full animate-spin mb-4"></span>
      <p class="text-sm font-medium text-slate-600 dark:text-slate-400">Loading your profile...</p>
    </div>

    <!-- Sidebar -->
    <aside class="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shrink-0">
      <div class="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-700">
        <span class="text-xl font-bold text-slate-900 dark:text-white tracking-tight">GDT</span>
      </div>
      
      <div class="flex-1 overflow-y-auto py-6 flex flex-col">
        <!-- USER SECTION -->
        <div class="px-4 mb-8">
          <div class="flex items-center gap-3 mb-3">
            <h3 class="text-[0.65rem] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">User</h3>
            <div class="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
          </div>
          <nav class="space-y-1">
            <router-link 
              v-for="item in navigationUser" 
              :key="item.name" 
              :to="item.path"
              class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
              :class="route.path === item.path ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'"
            >
              {{ item.name }}
            </router-link>
          </nav>
        </div>

        <!-- ACCOUNT SECTION -->
        <div class="px-4">
          <div class="flex items-center gap-3 mb-4">
            <h3 class="text-[0.65rem] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">Account</h3>
            <div class="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
          </div>
          
          <div class="px-3 mb-4">
            <select 
              v-if="myAccounts.length > 0"
              :value="genshinStore.selectedAccountId"
              @change="(e: any) => {
                const id = Number(e.target.value)
                const acc = myAccounts.find(a => a.id === id)
                if (acc) genshinStore.selectAccount(acc.id, acc.accountName)
              }"
              class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm rounded-md focus:ring-slate-900 dark:focus:ring-slate-500 focus:border-slate-900 dark:focus:border-slate-500 block p-2 outline-none transition-colors"
            >
              <option disabled value="">Select Account</option>
              <option v-for="acc in myAccounts" :key="acc.id" :value="acc.id">
                {{ acc.accountName }}
              </option>
            </select>
            <div v-else class="text-xs text-slate-400 dark:text-slate-500 italic">No accounts found</div>
          </div>

          <nav class="space-y-1">
            <template v-for="item in navigationAccount" :key="item.name">
              <router-link 
                v-if="genshinStore.selectedAccountId"
                :to="item.path"
                class="flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                :class="route.path === item.path ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'"
              >
                {{ item.name }}
              </router-link>
              <div 
                v-else
                class="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                title="Select an account first"
              >
                {{ item.name }}
              </div>
            </template>
          </nav>
        </div>

        <!-- SETTINGS SECTION (Bottom) -->
        <div class="px-4 mt-auto pt-8">
          <div class="flex items-center gap-3 mb-3">
            <h3 class="text-[0.65rem] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">System</h3>
            <div class="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
          </div>
          <div class="flex items-center rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm transition-colors">
            <router-link 
              to="/dashboard/settings"
              class="w-[80%] flex items-center px-3 py-2 text-sm font-medium transition-colors"
              :class="route.path === '/dashboard/settings' ? 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'"
            >
              Settings
            </router-link>
            <BaseButton 
              variant="ghost"
              @click="settingsStore.toggleTheme"
              class="w-[20%] !rounded-none !border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 h-full"
              title="Toggle Theme"
            >
              <Icon :icon="settingsStore.theme === 'dark' ? 'mdi:weather-night' : 'mdi:weather-sunny'" class="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </BaseButton>
          </div>
        </div>
      </div>
      
      <div class="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors">
        <div class="flex items-center gap-3 mb-4 px-2">
          <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold transition-colors">
            {{ authStore.user?.username.charAt(0).toUpperCase() }}
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ authStore.user?.username }}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400">Admin</span>
          </div>
        </div>
        <BaseButton 
          variant="outline"
          block
          @click="handleLogout"
        >
          Sign Out
        </BaseButton>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col overflow-hidden relative bg-slate-50 dark:bg-slate-900 transition-colors">
      <!-- Drop Overlay -->
      <div 
        v-if="isDragging" 
        class="absolute inset-0 z-50 bg-slate-900/10 dark:bg-slate-900/40 backdrop-blur-[2px] border-4 border-dashed border-slate-400 dark:border-slate-600 flex items-center justify-center pointer-events-none transition-colors"
      >
        <div class="bg-white dark:bg-slate-800 px-8 py-4 rounded-xl shadow-xl flex flex-col items-center transition-colors">
          <svg class="w-12 h-12 text-slate-500 dark:text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
          <p class="text-xl font-bold text-slate-700 dark:text-slate-200">Drop JSON file to import</p>
        </div>
      </div>

      <!-- Hidden File Input removed — import via ImportModal -->

      <header class="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-8 shadow-sm z-10 shrink-0 transition-colors">
        <div class="flex items-center gap-4">
          <h1 class="text-lg font-semibold text-slate-900 dark:text-white capitalize">
            {{ route.name?.toString().replace('-', ' ') || 'Dashboard' }}
          </h1>
          <div v-if="genshinStore.selectedAccountId" class="h-4 w-px bg-slate-300 dark:bg-slate-600 transition-colors"></div>
          <div v-if="genshinStore.selectedAccountId" class="text-sm text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400"></span>
            {{ genshinStore.selectedAccountName }}
          </div>
        </div>
        
        <BaseButton 
          v-if="genshinStore.selectedAccountId"
          variant="primary"
          @click="importFlow.openImportModal()"
        >
          Import Data
        </BaseButton>
      </header>
      
      <div class="flex-1 overflow-auto p-8 relative">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </main>

    <ImportModal :account-name="genshinStore.selectedAccountName" />
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
