export function formatGdtTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export function parseContentDispositionFilename(
  header: string | null,
): string | null {
  if (!header) return null
  const match = header.match(/filename="([^"]+)"/)
  return match?.[1] ?? null
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadFromResponse(res: Response, fallbackFilename: string) {
  const blob = await res.blob()
  const filename =
    parseContentDispositionFilename(res.headers.get('Content-Disposition')) ??
    fallbackFilename
  downloadBlob(blob, filename)
}

export async function downloadAuthenticatedUrl(
  url: string,
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>,
  fallbackFilename: string,
) {
  const res = await fetchWithAuth(url)
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`)
  }
  await downloadFromResponse(res, fallbackFilename)
}

export function formatExpiry(
  expiresAt: string | null | undefined,
  status?: string,
): string {
  if (status === 'EXPIRED') return 'Expired'
  if (!expiresAt) {
    if (status === 'PENDING' || status === 'PROCESSING') {
      return 'Starts after export completes'
    }
    return '—'
  }
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) {
    const minutes = Math.floor(diff / (1000 * 60))
    return minutes > 0 ? `Expires in ${minutes}m` : 'Expires soon'
  }
  if (hours < 24) return `Expires in ${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `Expires in ${days}d ${remHours}h` : `Expires in ${days}d`
}
