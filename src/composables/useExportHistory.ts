import { ref, onUnmounted, watch, type Ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useBulkExport } from './useBulkExport'

export interface ExportJobItem {
  jobId: string
  status: string
  progress: number
  total: number
  createdAt: string
  completedAt?: string
  expiresAt: string | null
  downloadReady: boolean
  error?: string
  downloadUrl: string
}

export interface UseExportHistoryOptions {
  /** Fired once when a highlighted job (route query jobId) becomes downloadable. */
  onJobReady?: (job: ExportJobItem) => void | Promise<void>
}

const readyNotifiedKey = (jobId: string) => `gdt-export-ready-${jobId}`

const POLL_INTERVAL_MS = 2000

export function useExportHistory(
  accountId: Ref<number | null>,
  highlightJobId?: Ref<string | undefined>,
  options: UseExportHistoryOptions = {},
) {
  const authStore = useAuthStore()
  const { redownload } = useBulkExport()

  const items = ref<ExportJobItem[]>([])
  const isLoading = ref(false)
  const meta = ref({ page: 1, limit: 10, totalPages: 1, total: 0 })

  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** Poll while the loaded list has any in-progress export. */
  const hasInProgressJobs = () =>
    items.value.some((j) => j.status === 'PROCESSING' || j.status === 'PENDING')

  const syncPolling = () => {
    if (hasInProgressJobs()) {
      startPolling()
    } else {
      stopPolling()
    }
  }

  const maybeNotifyReady = async () => {
    const highlight = highlightJobId?.value
    if (!highlight || sessionStorage.getItem(readyNotifiedKey(highlight))) return

    const job = items.value.find((j) => j.jobId === highlight)
    if (job?.downloadReady) {
      sessionStorage.setItem(readyNotifiedKey(highlight), '1')
      await options.onJobReady?.(job)
    }
  }

  const fetchHistory = async (page = 1, silent = false) => {
    if (!accountId.value) return
    if (!silent) isLoading.value = true
    try {
      const res = await authStore.fetchWithAuth(
        `${authStore.API_URL}/genshin-accounts/${accountId.value}/export-jobs?page=${page}&limit=${meta.value.limit}`,
      )
      if (res.ok) {
        const json = await res.json()
        const data = json.data ?? json
        items.value = data.items ?? []
        meta.value = data.meta ?? meta.value
        await maybeNotifyReady()
        syncPolling()
      }
    } finally {
      if (!silent) isLoading.value = false
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(async () => {
      if (!accountId.value) return
      if (!hasInProgressJobs()) {
        stopPolling()
        return
      }
      await fetchHistory(meta.value.page, true)
    }, POLL_INTERVAL_MS)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const downloadJob = async (job: ExportJobItem) => {
    if (!accountId.value || !job.downloadReady) return
    await redownload(accountId.value, job.downloadUrl, job.createdAt)
  }

  watch(
    accountId,
    (id) => {
      if (id) {
        fetchHistory(1)
      } else {
        items.value = []
        stopPolling()
      }
    },
    { immediate: true },
  )

  watch(
    () => highlightJobId?.value,
    () => {
      if (accountId.value) {
        fetchHistory(meta.value.page, true)
      }
    },
  )

  watch(items, syncPolling, { deep: true })

  onUnmounted(stopPolling)

  return {
    items,
    isLoading,
    meta,
    fetchHistory,
    downloadJob,
    startPolling,
    stopPolling,
  }
}
