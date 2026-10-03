import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { swalSuccess, swalError, swalInfo } from '../utils/swal'
import { downloadAuthenticatedUrl, formatGdtTimestamp } from '../utils/export'

export interface BulkExportOptions {
  redirectAfter?: boolean
}

export function useBulkExport() {
  const authStore = useAuthStore()
  const router = useRouter()
  const isExporting = ref(false)

  const bulkExport = async (
    accountId: number,
    payload: { snapshotIds: number[]; selectAll: boolean },
    options: BulkExportOptions = {},
  ) => {
    const { redirectAfter = false } = options
    isExporting.value = true

    try {
      const res = await authStore.fetchWithAuth(
        `${authStore.API_URL}/genshin-accounts/${accountId}/snapshots/bulk-export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const json = await res.json()
      const data = json.data ?? json

      if (!res.ok) {
        const message =
          json.message ||
          (Array.isArray(json.message) ? json.message.join(', ') : null) ||
          data.message ||
          (res.status === 409
            ? 'You already have an export in progress.'
            : 'Bulk export failed')
        throw new Error(message)
      }

      const jobId = data.jobId as string
      const status = data.status as string

      if (status === 'COMPLETED') {
        await swalSuccess('Export ready', 'Your bulk export is ready on the Export page.')
      } else {
        await swalInfo(
          'Export started',
          'Track progress and download on the Export page.',
        )
      }

      if (redirectAfter) {
        await router.push({ name: 'export', query: { jobId } })
      }

      return data
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bulk export failed'
      swalError('Export failed', message)
      throw err
    } finally {
      isExporting.value = false
    }
  }

  const redownload = async (accountId: number, downloadUrl: string, createdAt?: string) => {
    const fallback = `GDT_bulk_export-${formatGdtTimestamp(createdAt ?? new Date())}.zip`
    await downloadAuthenticatedUrl(
      `${authStore.API_URL}${downloadUrl}`,
      authStore.fetchWithAuth.bind(authStore),
      fallback,
    )
  }

  return { isExporting, bulkExport, redownload }
}
