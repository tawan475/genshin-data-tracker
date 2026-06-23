<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import { useSettingsStore } from '../../stores/settings'
import BaseTable, { type TableLabel } from '../../components/BaseTable.vue'
import BaseButton from '../../components/BaseButton.vue'
import { swalInfo, swalConfirm, swalSuccess, swalError } from '../../utils/swal'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()
const settingsStore = useSettingsStore()

const snapshots = ref<any[]>([])
const isLoading = ref(true)
const meta = ref({ page: 1, limit: 20, totalPages: 1, total: 0 })
const pageInput = ref(1)

const baseTableRef = ref<InstanceType<typeof BaseTable> | null>(null)

const storageStats = ref<{ totalSnapshots: number, totalFileSize: number, totalCompressedFileSize: number } | null>(null)
const isStorageLoading = ref(true)

const selectAll = ref(false)
const selectedIds = ref<number[]>([])

const toggleSelectAll = () => {
  selectAll.value = !selectAll.value
  if (!selectAll.value) {
    selectedIds.value = []
  }
}

const toggleSelection = (id: number) => {
  if (selectAll.value) {
    selectAll.value = false
    selectedIds.value = snapshots.value.filter(s => s.id !== id).map(s => s.id)
  } else {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter(i => i !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }
}

const isSelected = (id: number) => {
  if (selectAll.value) return true
  return selectedIds.value.includes(id)
}

const selectedCount = computed(() => {
  if (selectAll.value) return meta.value.total
  return selectedIds.value.length
})

const handleBulkDownload = () => {
  swalInfo('Coming Soon', 'Bulk download functionality will be implemented later.')
}

const handleBulkDelete = async () => {
  if (!genshinStore.selectedAccountId) return
  
  const confirmed = await swalConfirm(
    'Are you sure?',
    `You are about to delete ${selectedCount.value} snapshot(s). This cannot be undone.`,
    { confirmText: 'Yes, delete them!', isDanger: true }
  )
  
  if (!confirmed) return
  
  // Implementation will be handled by the backend API later
  swalSuccess('Prepared', `Bulk delete prepared for ${selectedCount.value} item(s).\nselectAll: ${selectAll.value}\nselectedIds: ${selectedIds.value.join(', ')}`)
}

const tableLabels: TableLabel[] = [
  { key: 'select', title: '', slot: true, headerSlot: true },
  { key: 'createdAt', title: 'Date', slot: true },
  { key: 'version', title: 'Format', slot: true },
  { key: 'source', title: 'Source' },
  { key: 'fileSize', title: 'Raw Size', slot: true },
  { key: 'compressedFileSize', title: 'Stored Size', slot: true },
  { key: 'characters', title: 'Characters', slot: true },
  { key: 'artifacts', title: 'Artifacts', slot: true },
  { key: 'weapons', title: 'Weapons', slot: true },
  { key: 'achievements', title: 'Achievements', slot: true },
  { key: 'actions', title: 'Actions', slot: true }
]

const fetchSnapshots = async (page = 1) => {
  if (!genshinStore.selectedAccountId) return
  isLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/snapshots?page=${page}&limit=${meta.value.limit}`)
    if (res.ok) {
      const json = await res.json()
      snapshots.value = json.data.items || []
      meta.value = json.data.meta || { page: 1, limit: meta.value.limit, totalPages: 1, total: 0 }
      pageInput.value = meta.value.page
      
      // If selectAll is false, we might want to clear selectedIds on page change, or keep them.
      // The user requested: "selection presist between page change using snapshot id"
      // So we do not clear selectedIds!
    }
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const fetchStorageStats = async () => {
  if (!genshinStore.selectedAccountId) return
  isStorageLoading.value = true
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/storage-stats`)
    if (res.ok) {
      const parsed = await res.json()
      const storage = parsed.data?.storage || parsed.storage
      if (storage) {
        storageStats.value = storage
      }
    }
  } catch (err) {
    console.error(err)
  } finally {
    isStorageLoading.value = false
  }
}

watch(() => genshinStore.selectedAccountId, () => {
  fetchSnapshots(1)
  fetchStorageStats()
})
watch(() => genshinStore.refetchTrigger, () => {
  fetchSnapshots(meta.value.page)
  fetchStorageStats()
})

onMounted(() => {
  if (genshinStore.selectedAccountId) {
    fetchSnapshots(1)
    fetchStorageStats()
  }
})

const downloadSnapshot = async (snapshot: any) => {
  if (!genshinStore.selectedAccountId) return
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/snapshots/${snapshot.id}/export`)
    if (res.ok) {
      const json = await res.json()
      const goodData = json.data || json
      const blob = new Blob([JSON.stringify(goodData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dateStr = new Date(snapshot.createdAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.download = `genshin_export_${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      swalError('Error', 'Failed to download snapshot')
    }
  } catch (err) {
    console.error('Download error:', err)
    swalError('Error', 'Failed to download snapshot')
  }
}

const deleteSnapshot = async (id: number) => {
  if (!genshinStore.selectedAccountId) return
  
  const confirmed = await swalConfirm(
    'Are you sure?',
    'You are about to delete this snapshot. This cannot be undone.',
    { confirmText: 'Yes, delete it!', isDanger: true }
  )
  
  if (!confirmed) return
  
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/snapshots/${id}`, {
      method: 'DELETE'
    })
    if (res.ok) {
      // Refresh the page
      fetchSnapshots(meta.value.page)
      genshinStore.triggerRefetch() // Inform other components if needed
    } else {
      swalError('Error', 'Failed to delete snapshot')
    }
  } catch (err) {
    console.error('Delete error:', err)
    swalError('Error', 'Failed to delete snapshot')
  }
}

const formatDate = (d: string) => new Date(d).toLocaleString(undefined, { hour12: !settingsStore.use24Hour })

const onLimitChange = () => {
  fetchSnapshots(1)
  baseTableRef.value?.scrollToTop()
}

const goToPage = () => {
  let p = parseInt(pageInput.value as any)
  if (isNaN(p) || p < 1) p = 1
  if (p > meta.value.totalPages) p = meta.value.totalPages
  pageInput.value = p
  fetchSnapshots(p)
  baseTableRef.value?.scrollToTop()
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 min-h-[60vh] relative">
    <div v-if="!genshinStore.selectedAccountId" class="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 transition-colors">
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No Account Selected</h3>
      <p class="text-slate-500 dark:text-slate-400">Please select or create an account from the sidebar.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Storage Stats Loading Skeleton -->
      <div v-if="isStorageLoading" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 relative z-10 mb-8 transition-colors animate-pulse">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="h-5 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
          <div class="flex flex-wrap items-center gap-6">
            <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
            <div class="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>

      <!-- Storage Stats -->
      <div v-else-if="storageStats" class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 relative z-10 mb-8 transition-colors">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <h3 class="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Storage</h3>
          <div class="flex flex-wrap items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400">Snapshots:</span>
              <span class="font-semibold text-slate-900 dark:text-slate-100">{{ storageStats.totalSnapshots }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400">Raw Data:</span>
              <span class="font-semibold text-slate-900 dark:text-slate-100">{{ formatBytes(storageStats.totalFileSize) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400">Stored:</span>
              <span class="font-semibold text-emerald-700 dark:text-emerald-400">{{ formatBytes(storageStats.totalCompressedFileSize) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-slate-500 dark:text-slate-400">Saved:</span>
              <span class="font-semibold text-emerald-700 dark:text-emerald-400">
                {{ storageStats.totalFileSize > 0 ? ((1 - storageStats.totalCompressedFileSize / storageStats.totalFileSize) * 100).toFixed(1) : 0 }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky Toolbar Overlay -->
      <div class="sticky top-0 z-40 w-full h-0">
        <transition name="slide-down">
          <div v-if="selectedCount > 0" class="absolute w-full flex items-center justify-between bg-slate-800 dark:bg-slate-700 rounded-lg p-3 shadow-md z-20 transition-colors">
            <span class="text-sm font-semibold text-white ml-2">{{ selectedCount }} selected out of {{ meta.total }}</span>
            <div class="flex items-center gap-3">
              <BaseButton variant="secondary" size="sm" @click="handleBulkDownload">
                Download
              </BaseButton>
              <BaseButton variant="danger" size="sm" @click="handleBulkDelete">
                Delete
              </BaseButton>
            </div>
          </div>
        </transition>
      </div>

      <!-- Normal Flow Heading -->
      <div class="flex items-center justify-between mb-4 h-[3.25rem]">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white transition-colors">Import History</h2>
      </div>

      <BaseTable ref="baseTableRef" :labels="tableLabels" :data="snapshots" :isLoading="isLoading">
        <template #header-select>
          <div 
            class="flex items-center justify-center cursor-pointer -m-4 p-4"
            @click="toggleSelectAll"
          >
            <div 
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
              :class="selectAll ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent'"
            >
              <svg class="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
          </div>
        </template>
        <template #select="{ item }">
          <div 
            class="flex items-center justify-center cursor-pointer -m-4 p-4"
            @click="toggleSelection(item.id)"
          >
            <div 
              class="w-4 h-4 rounded border flex items-center justify-center transition-colors"
              :class="isSelected(item.id) ? 'bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent'"
            >
              <svg class="w-3 h-3 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
            </div>
          </div>
        </template>
        <template #createdAt="{ item }">
          <span class="font-medium whitespace-nowrap">{{ formatDate(item.createdAt) }}</span>
        </template>
        <template #version="{ item }">
          <span class="px-2 py-0.5 text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-full transition-colors">
            v{{ item.version }}
          </span>
        </template>
        <template #fileSize="{ item }">
          <span class="text-slate-500 dark:text-slate-400 font-medium">{{ item.fileSize ? (item.fileSize / 1024).toFixed(1) + ' KB' : '0 KB' }}</span>
        </template>
        <template #compressedFileSize="{ item }">
          <span class="text-emerald-600 dark:text-emerald-400 font-medium">{{ item.compressedFileSize ? (item.compressedFileSize / 1024).toFixed(1) + ' KB' : '0 KB' }}</span>
        </template>
        <template #characters="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ item._count.characters }}</span>
        </template>
        <template #artifacts="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ item._count.artifacts }}</span>
        </template>
        <template #weapons="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ item._count.weapons }}</span>
        </template>
        <template #achievements="{ item }">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ item._count.achievements }}</span>
        </template>
        <template #actions="{ item }">
          <div class="flex items-center gap-2">
            <BaseButton 
              size="xs"
              variant="primary"
              @click="downloadSnapshot(item)"
              title="Download GOOD"
            >
              <template #icon>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              </template>
              DL
            </BaseButton>
            <BaseButton 
              size="xs"
              variant="danger-soft"
              @click="deleteSnapshot(item.id)"
              title="Delete Snapshot"
            >
              <template #icon>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </template>
              Del
            </BaseButton>
          </div>
        </template>
        
        <template #empty>
          <div class="py-8">
            <h3 class="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No Snapshots Found</h3>
            <p class="text-slate-500 dark:text-slate-400">Import your first GOOD JSON file to see your snapshots here.</p>
          </div>
        </template>
      </BaseTable>

      <!-- Pagination -->
      <div v-if="meta.totalPages > 1 || snapshots.length > 0" class="flex flex-wrap justify-between items-center gap-4 mt-6">
        <!-- Left: Per Page Selector -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500 dark:text-slate-400 font-medium transition-colors">Per page:</label>
          <select 
            v-model="meta.limit" 
            @change="onLimitChange"
            class="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>

        <!-- Center: Controls -->
        <div class="flex items-center gap-4">
          <BaseButton 
            variant="outline"
            size="sm"
            @click="() => { fetchSnapshots(meta.page - 1); baseTableRef?.scrollToTop() }"
            :disabled="meta.page <= 1"
          >
            Previous
          </BaseButton>
          <span class="text-sm text-slate-600 dark:text-slate-400 font-medium transition-colors">Page {{ meta.page }} of {{ meta.totalPages }}</span>
          <BaseButton 
            variant="outline"
            size="sm"
            @click="() => { fetchSnapshots(meta.page + 1); baseTableRef?.scrollToTop() }"
            :disabled="meta.page >= meta.totalPages"
          >
            Next
          </BaseButton>
        </div>

        <!-- Right: Go to Page -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500 dark:text-slate-400 font-medium transition-colors">Go to:</label>
          <input 
            type="number" 
            v-model="pageInput" 
            @keyup.enter="goToPage"
            min="1" 
            :max="meta.totalPages"
            class="w-16 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 transition-colors"
          />
          <BaseButton 
            variant="primary"
            size="sm"
            @click="goToPage"
          >
            Go
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

</style>
