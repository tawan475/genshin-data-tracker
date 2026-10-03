import { ref, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'

export interface ActiveExportJob {
  jobId: string
  status: string
  progress: number
  total: number
  genshinAccountId: number
  createdAt: string
}

const POLL_INTERVAL_MS = 2000

export function useActiveExport() {
  const authStore = useAuthStore()
  const inProgress = ref(false)
  const activeJob = ref<ActiveExportJob | null>(null)
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const fetchActiveExport = async () => {
    const res = await authStore.fetchWithAuth(
      `${authStore.API_URL}/genshin-accounts/active-export`,
    )
    if (!res.ok) return

    const json = await res.json()
    const data = json.data ?? json

    inProgress.value = Boolean(data.inProgress)
    activeJob.value = data.inProgress ? data.job : null
    syncPolling()
  }

  const syncPolling = () => {
    if (inProgress.value) {
      if (!pollTimer) {
        pollTimer = setInterval(() => fetchActiveExport(), POLL_INTERVAL_MS)
      }
    } else {
      stopPolling()
    }
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  onUnmounted(stopPolling)

  return {
    inProgress,
    activeJob,
    fetchActiveExport,
    stopPolling,
  }
}
