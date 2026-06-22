<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useGenshinStore } from '../../stores/genshin'
import BaseTable, { type TableLabel } from '../../components/BaseTable.vue'

const authStore = useAuthStore()
const genshinStore = useGenshinStore()

const snapshots = ref<any[]>([])
const isLoading = ref(true)
const meta = ref({ page: 1, limit: 20, totalPages: 1, total: 0 })
const pageInput = ref(1)

const tableLabels: TableLabel[] = [
  { key: 'createdAt', title: 'Date', slot: true },
  { key: 'version', title: 'Format Version', slot: true },
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
    }
  } catch (err) {
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

watch(() => genshinStore.selectedAccountId, () => {
  fetchSnapshots(1)
})
watch(() => genshinStore.refetchTrigger, () => {
  fetchSnapshots(meta.value.page)
})

onMounted(() => {
  if (genshinStore.selectedAccountId) {
    fetchSnapshots(1)
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
      alert('Failed to download snapshot')
    }
  } catch (err) {
    console.error('Download error:', err)
    alert('Failed to download snapshot')
  }
}

const deleteSnapshot = async (id: number) => {
  if (!genshinStore.selectedAccountId) return
  if (!confirm('Are you sure you want to delete this snapshot? This cannot be undone.')) return
  
  try {
    const res = await authStore.fetchWithAuth(`${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/snapshots/${id}`, {
      method: 'DELETE'
    })
    if (res.ok) {
      // Refresh the page
      fetchSnapshots(meta.value.page)
      genshinStore.triggerRefetch() // Inform other components if needed
    } else {
      alert('Failed to delete snapshot')
    }
  } catch (err) {
    console.error('Delete error:', err)
    alert('Failed to delete snapshot')
  }
}

const formatDate = (d: string) => new Date(d).toLocaleString()

const onLimitChange = () => {
  fetchSnapshots(1)
}

const goToPage = () => {
  let p = parseInt(pageInput.value as any)
  if (isNaN(p) || p < 1) p = 1
  if (p > meta.value.totalPages) p = meta.value.totalPages
  pageInput.value = p
  fetchSnapshots(p)
}
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-8 min-h-[60vh] relative">
    <div v-if="!genshinStore.selectedAccountId" class="text-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm mt-8">
      <h3 class="text-lg font-bold text-slate-700 mb-2">No Account Selected</h3>
      <p class="text-slate-500">Please select or create an account from the sidebar.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-slate-900">Import History</h2>
      </div>

      <BaseTable :labels="tableLabels" :data="snapshots" :isLoading="isLoading">
        <template #createdAt="{ item }">
          <span class="font-medium whitespace-nowrap">{{ formatDate(item.createdAt) }}</span>
        </template>
        <template #version="{ item }">
          <span class="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
            v{{ item.version }}
          </span>
        </template>
        <template #fileSize="{ item }">
          <span class="text-slate-500 font-medium">{{ item.fileSize ? (item.fileSize / 1024).toFixed(1) + ' KB' : '0 KB' }}</span>
        </template>
        <template #compressedFileSize="{ item }">
          <span class="text-emerald-600 font-medium">{{ item.compressedFileSize ? (item.compressedFileSize / 1024).toFixed(1) + ' KB' : '0 KB' }}</span>
        </template>
        <template #characters="{ item }">
          <span class="font-medium text-slate-700">{{ item._count.characters }}</span>
        </template>
        <template #artifacts="{ item }">
          <span class="font-medium text-slate-700">{{ item._count.artifacts }}</span>
        </template>
        <template #weapons="{ item }">
          <span class="font-medium text-slate-700">{{ item._count.weapons }}</span>
        </template>
        <template #achievements="{ item }">
          <span class="font-medium text-slate-700">{{ item._count.achievements }}</span>
        </template>
        <template #actions="{ item }">
          <div class="flex items-center gap-2">
            <button 
              @click="downloadSnapshot(item)"
              class="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded shadow-sm hover:bg-slate-800 transition-colors flex items-center gap-1.5"
              title="Download GOOD"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              DL
            </button>
            <button 
              @click="deleteSnapshot(item.id)"
              class="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-medium rounded shadow-sm hover:bg-red-100 hover:border-red-300 transition-colors flex items-center gap-1.5"
              title="Delete Snapshot"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              Del
            </button>
          </div>
        </template>
        
        <template #empty>
          <div class="py-8">
            <h3 class="text-lg font-bold text-slate-700 mb-2">No Snapshots Found</h3>
            <p class="text-slate-500">Import your first GOOD JSON file to see your snapshots here.</p>
          </div>
        </template>
      </BaseTable>

      <!-- Pagination -->
      <div v-if="meta.totalPages > 1 || snapshots.length > 0" class="flex flex-wrap justify-between items-center gap-4 mt-6">
        <!-- Left: Per Page Selector -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500 font-medium">Per page:</label>
          <select 
            v-model="meta.limit" 
            @change="onLimitChange"
            class="px-2 py-1 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </div>

        <!-- Center: Controls -->
        <div class="flex items-center gap-4">
          <button 
            @click="fetchSnapshots(meta.page - 1)" 
            :disabled="meta.page <= 1"
            class="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span class="text-sm text-slate-600 font-medium">Page {{ meta.page }} of {{ meta.totalPages }}</span>
          <button 
            @click="fetchSnapshots(meta.page + 1)" 
            :disabled="meta.page >= meta.totalPages"
            class="px-3 py-1 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>

        <!-- Right: Go to Page -->
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500 font-medium">Go to:</label>
          <input 
            type="number" 
            v-model="pageInput" 
            @keyup.enter="goToPage"
            min="1" 
            :max="meta.totalPages"
            class="w-16 px-2 py-1 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button 
            @click="goToPage"
            class="px-3 py-1 bg-slate-900 text-white border border-slate-900 rounded-md text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
