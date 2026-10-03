import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'

export interface DashboardSummary {
  totalAccounts: number
  activeAccounts: number
  totalSnapshots: number
  totalArtifacts: number
  totalCharacters: number
  totalStorageBytes: number
  totalCompressedBytes: number
  lastSyncAt: string | null
}

export interface DashboardAccountSummary {
  id: number
  accountName: string | null
  uid: string | null
  server: string | null
  snapshotCount: number
  artifactCount: number
  characterCount: number
  lastSyncAt: string | null
}

export interface DashboardRecentActivity {
  id: number
  genshinAccountId: number
  accountName: string | null
  createdAt: string
  fileSize: number
  _count: {
    characters: number
    artifacts: number
  }
}

export interface DashboardSummaryData {
  summary: DashboardSummary
  accounts: DashboardAccountSummary[]
  recentActivity: DashboardRecentActivity[]
}

export function useDashboardSummary() {
  const authStore = useAuthStore()
  const genshinStore = useGenshinStore()

  const data = ref<DashboardSummaryData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const fetchSummary = async () => {
    isLoading.value = true
    error.value = null
    try {
      const res = await authStore.fetchWithAuth(
        `${authStore.API_URL}/genshin-accounts/dashboard-summary`,
      )
      if (!res.ok) {
        throw new Error('Failed to load dashboard summary')
      }
      const json = await res.json()
      data.value = (json.data ?? json) as DashboardSummaryData
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : 'Failed to load dashboard summary'
      data.value = null
    } finally {
      isLoading.value = false
    }
  }

  onMounted(() => {
    fetchSummary()
  })

  watch(
    () => genshinStore.accountsRefetchTrigger,
    () => fetchSummary(),
  )

  watch(
    () => genshinStore.refetchTrigger,
    () => fetchSummary(),
  )

  return {
    data,
    isLoading,
    error,
    fetchSummary,
  }
}
