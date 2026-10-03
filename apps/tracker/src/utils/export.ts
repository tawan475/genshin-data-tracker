export function formatGdtTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function toDatetimeLocalValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 19)
}

/** First YYYY-MM-DD + T/_ + HH-mm-ss or HH:mm:ss in the filename */
const FILENAME_TIMESTAMP_RE =
  /(\d{4}-\d{2}-\d{2})[T_](\d{2})[-:](\d{2})[-:](\d{2})/

export function parseImportFilenameTimestamp(filename: string): string | null {
  const match = filename.match(FILENAME_TIMESTAMP_RE)
  if (!match) return null

  const [, datePart, hour, minute, second] = match
  const separator = filename[match.index! + datePart.length]
  const timePart = match[0].slice(datePart.length + 1)
  const isoTime = `${hour}:${minute}:${second}`

  // GDT exports: UTC with dashes in the time segment (e.g. 2026-06-24T15-30-52)
  const date =
    separator === 'T' && timePart.includes('-')
      ? new Date(`${datePart}T${isoTime}Z`)
      : new Date(`${datePart}T${isoTime}`)

  return isNaN(date.getTime()) ? null : toDatetimeLocalValue(date)
}

export type ImportResult = { filename: string; status: string; message?: string }

export type ImportProgressEvent = {
  type: 'progress'
  processed: number
  total: number
  filename: string
  status: string
  message?: string
}

export type ImportStreamEvent =
  | ImportProgressEvent
  | { type: 'complete'; results: ImportResult[] }

export async function consumeImportStream(
  response: Response,
  onProgress?: (event: ImportProgressEvent) => void,
): Promise<ImportResult[]> {
  const completeResults: ImportResult[] = []
  const progressByFilename = new Map<string, ImportResult>()
  let lastProgress: ImportProgressEvent | null = null

  const handleEvent = (event: ImportStreamEvent) => {
    if (event.type === 'progress') {
      lastProgress = event
      onProgress?.(event)
      if (event.filename && event.status) {
        progressByFilename.set(event.filename, {
          filename: event.filename,
          status: event.status,
          message: event.message,
        })
      }
    } else if (event.type === 'complete') {
      completeResults.push(...(event.results ?? []))
    }
  }

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      handleEvent(JSON.parse(trimmed) as ImportStreamEvent)
    } catch {
      console.error('Failed to parse NDJSON line', trimmed)
    }
  }

  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let done = false

    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (!value) continue

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    }

    if (buffer.trim()) handleLine(buffer)
  } else {
    const text = await response.text()
    for (const line of text.split('\n')) handleLine(line)
  }

  if (completeResults.length > 0) return completeResults

  if (
    lastProgress &&
    lastProgress.processed >= lastProgress.total &&
    progressByFilename.size > 0
  ) {
    return Array.from(progressByFilename.values())
  }

  throw new Error('Import finished but no completion data was received')
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
