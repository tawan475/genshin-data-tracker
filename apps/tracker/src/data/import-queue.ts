/**
 * The GOOD upload queue, one per account.
 *
 * It lives at module scope rather than in the Import screen, so an upload
 * keeps going while the user browses other screens and is still there when
 * they come back. Files go up one at a time, oldest capture first (the server
 * folds an unchanged inventory into the previous snapshot only when captures
 * arrive in order), gzipped in the browser.
 *
 * The server allows 60 uploads a minute per account: the queue paces itself
 * under that and, if it is still refused (another tab, Irminsul uploading at
 * the same time), waits and retries instead of failing the file. The daily
 * upload quota and the storage quota (per user) refuse every later new
 * snapshot too: that file fails and the queue pauses, the rest kept.
 */

import { MAX_IMPORT_FILES, MAX_IMPORT_FILE_SIZE_BYTES, MAX_IMPORT_FILE_SIZE_MB } from '@gdt/shared'
import { markRaw, reactive } from 'vue'
import { ApiRequestError, api } from '@/api'
import { formatDateTime, formatNumber, formatTime } from '@/lib/format'
import { importingAccounts } from '@/live/holds'
import router from '@/router'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'
import { compressFile, readCaptureTime } from './import-files'

export type ImportStatus =
  | 'queued'
  | 'uploading'
  | 'waiting'
  | 'created'
  | 'unchanged'
  | 'failed'
  | 'cancelled'

export interface ImportItem {
  id: number
  file: File
  name: string
  /** Folder path when the file came from a folder, else the name. */
  path: string
  size: number
  /**
   * Capture time: read from the file before upload, then the time the server
   * stored. `null`: the file has none (the server uses the upload time).
   * `undefined`: not read yet.
   */
  takenAt: number | null | undefined
  status: ImportStatus
  /** Why it failed, or what it is waiting for. */
  message: string | null
  /** Whether trying again could help (network, server errors). */
  retryable: boolean
  /** Bytes sent (gzipped). */
  sentBytes: number | null
  storedSize: number | null
  snapshotId: number | null
}

export interface ImportRun {
  /** Items that belong to this run (files added mid-run join it). */
  ids: Set<number>
  sentBytes: number
  startedAt: number
  finishedAt: number | null
  outcome: 'done' | 'cancelled' | null
}

export type QueueState = 'idle' | 'running' | 'pausing' | 'paused' | 'cancelling'

export interface ImportQueue {
  accountId: number
  userId: number | null
  items: ImportItem[]
  state: QueueState
  run: ImportRun | null
  /** When an upload paused by the rate limit or a retry continues. */
  waitUntil: number | null
  waitReason: string | null
  /** Files whose capture time is still being read. */
  reading: number
}

export interface AddReport {
  added: number
  /** Not .json. */
  ignored: number
  /** Already in the list (same name, size and modified time). */
  duplicates: number
  /** Past the MAX_IMPORT_FILES list limit. */
  overLimit: number
}

export interface RunSummary {
  total: number
  /** Finished one way or another (created, unchanged or failed). */
  done: number
  created: number
  unchanged: number
  failed: number
  pending: number
  cancelled: number
  sentBytes: number
  storedBytes: number
  current: ImportItem | null
}

/** Uploads a minute the server allows per account, and the share this queue uses. */
const RATE_WINDOW_MS = 60_000
const PACED_LIMIT = 55
const MAX_RATE_LIMIT_RETRIES = 10
const MAX_TRANSIENT_RETRIES = 3

const queues = new Map<number, ImportQueue>()
/** Per-queue runner state, kept off the reactive object. */
const readers = new WeakMap<ImportQueue, Promise<void>>()
const loops = new WeakSet<ImportQueue>()
const wakers = new WeakMap<ImportQueue, () => void>()
const discarded = new WeakSet<ImportQueue>()
/** Upload start times per account, for pacing under the server's limit. */
const recent = new Map<number, number[]>()
let nextId = 1

const nameOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** The queue for an account (created on first use). */
export function useImportQueue(accountId: number): ImportQueue {
  const userId = useSession().me?.id ?? null
  let queue = queues.get(accountId)
  if (queue && queue.userId !== userId) {
    discardImportQueue(accountId)
    queue = undefined
  }
  if (!queue) {
    queue = reactive<ImportQueue>({
      accountId,
      userId,
      items: [],
      state: 'idle',
      run: null,
      waitUntil: null,
      waitReason: null,
      reading: 0,
    })
    queues.set(accountId, queue)
  }
  return queue
}

/** Stops and forgets an account's queue (after the account is deleted). */
export function discardImportQueue(accountId: number): void {
  const queue = queues.get(accountId)
  if (!queue) return
  discarded.add(queue)
  queues.delete(accountId)
  if (queue.state === 'running' || queue.state === 'pausing') queue.state = 'cancelling'
  wake(queue)
}

export function isBusy(queue: ImportQueue): boolean {
  return queue.state === 'running' || queue.state === 'pausing' || queue.state === 'cancelling'
}

function fileKey(file: File): string {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified}`
}

/** Adds files to the list; files added during a run join it. */
export function addFiles(queue: ImportQueue, files: File[]): AddReport {
  const report: AddReport = { added: 0, ignored: 0, duplicates: 0, overLimit: 0 }
  const seen = new Set(queue.items.map((item) => fileKey(item.file)))
  const joinRun = queue.run && queue.run.finishedAt === null ? queue.run : null
  for (const file of files) {
    const key = fileKey(file)
    if (seen.has(key)) {
      report.duplicates++
      continue
    }
    if (queue.items.length >= MAX_IMPORT_FILES) {
      report.overLimit++
      continue
    }
    seen.add(key)
    const item: ImportItem = {
      id: nextId++,
      file: markRaw(file),
      name: file.name,
      path: file.webkitRelativePath || file.name,
      size: file.size,
      takenAt: undefined,
      status: 'queued',
      message: null,
      retryable: false,
      sentBytes: null,
      storedSize: null,
      snapshotId: null,
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      fail(item, `Over ${MAX_IMPORT_FILE_SIZE_MB} MB`)
      item.takenAt = null
    } else if (file.size === 0) {
      fail(item, 'Empty file')
      item.takenAt = null
    }
    queue.items.push(item)
    if (joinRun && item.status === 'queued') joinRun.ids.add(item.id)
    report.added++
  }
  if (report.added > 0) {
    sortItems(queue)
    void readCaptureTimes(queue)
  }
  return report
}

function fail(item: ImportItem, message: string, retryable = false) {
  item.status = 'failed'
  item.message = message
  item.retryable = retryable
}

/** Oldest capture first; files without a time go last (they get the upload time), by name. */
function sortItems(queue: ImportQueue) {
  const rank = (item: ImportItem) =>
    item.takenAt === undefined
      ? Number.MAX_SAFE_INTEGER - 1
      : (item.takenAt ?? Number.MAX_SAFE_INTEGER)
  queue.items.sort((a, b) => rank(a) - rank(b) || nameOrder.compare(a.path, b.path))
}

/** Reads capture times one file at a time; resolves when every file has one. */
function readCaptureTimes(queue: ImportQueue): Promise<void> {
  const running = readers.get(queue)
  if (running) return running
  const work = (async () => {
    for (;;) {
      const pending = queue.items.filter((item) => item.takenAt === undefined)
      if (pending.length === 0) break
      queue.reading = pending.length
      for (const item of pending) {
        try {
          const result = await readCaptureTime(item.file)
          item.takenAt = result.takenAt
          if (result.invalid && item.status === 'queued') fail(item, result.invalid)
        } catch {
          // Unreadable here (moved or deleted since it was picked): let the upload report it.
          item.takenAt = null
        }
        queue.reading--
      }
      sortItems(queue)
    }
    queue.reading = 0
  })().finally(() => readers.delete(queue))
  readers.set(queue, work)
  return work
}

/**
 * Starts uploading every queued file (and, unless told otherwise, files a
 * cancelled run left behind), or resumes a paused run.
 */
export function start(queue: ImportQueue, includeCancelled = true): void {
  if (queue.state === 'pausing') {
    queue.state = 'running'
    return
  }
  if (queue.state === 'running' || queue.state === 'cancelling') return
  if (queue.state === 'paused' && queue.run) {
    queue.state = 'running'
  } else {
    if (includeCancelled) {
      for (const item of queue.items) if (item.status === 'cancelled') item.status = 'queued'
    }
    const ids = queue.items.filter((item) => item.status === 'queued').map((item) => item.id)
    if (ids.length === 0) return
    queue.run = {
      ids: new Set(ids),
      sentBytes: 0,
      startedAt: Date.now(),
      finishedAt: null,
      outcome: null,
    }
    queue.state = 'running'
  }
  void loop(queue)
}

/** Stops after the file being sent (or at once, if waiting on the rate limit). */
export function pause(queue: ImportQueue): void {
  if (queue.state !== 'running') return
  queue.state = 'pausing'
  wake(queue)
}

/** Stops the run; files not sent yet stay in the list as not uploaded. */
export function cancel(queue: ImportQueue): void {
  if (queue.state === 'paused') {
    finishCancelled(queue)
    return
  }
  if (queue.state !== 'running' && queue.state !== 'pausing') return
  queue.state = 'cancelling'
  wake(queue)
}

/** Queues failed files that may succeed on another try. */
export function retryFailed(queue: ImportQueue): void {
  const retry = queue.items.filter((item) => item.status === 'failed' && item.retryable)
  for (const item of retry) {
    item.status = 'queued'
    item.message = null
  }
  if (queue.state === 'idle') start(queue, false)
  else if (queue.run) for (const item of retry) queue.run.ids.add(item.id)
}

export function removeItem(queue: ImportQueue, id: number): void {
  const index = queue.items.findIndex((item) => item.id === id)
  const item = queue.items[index]
  if (!item || item.status === 'uploading' || item.status === 'waiting') return
  queue.items.splice(index, 1)
  queue.run?.ids.delete(id)
}

/** Drops files that are in the tracker now (created or unchanged), between runs. */
export function clearFinished(queue: ImportQueue): void {
  if (queue.state !== 'idle') return
  queue.items = queue.items.filter(
    (item) => item.status !== 'created' && item.status !== 'unchanged',
  )
  queue.run = null
}

export function clearAll(queue: ImportQueue): void {
  if (queue.state !== 'idle') return
  queue.items = []
  queue.run = null
}

export function summarize(queue: ImportQueue): RunSummary {
  const summary: RunSummary = {
    total: 0,
    done: 0,
    created: 0,
    unchanged: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    sentBytes: queue.run?.sentBytes ?? 0,
    storedBytes: 0,
    current: null,
  }
  const run = queue.run
  if (!run) return summary
  for (const item of queue.items) {
    if (!run.ids.has(item.id)) continue
    summary.total++
    switch (item.status) {
      case 'created':
        summary.created++
        summary.done++
        summary.storedBytes += item.storedSize ?? 0
        break
      case 'unchanged':
        summary.unchanged++
        summary.done++
        break
      case 'failed':
        summary.failed++
        summary.done++
        break
      case 'cancelled':
        summary.cancelled++
        break
      case 'uploading':
      case 'waiting':
        summary.current = item
        summary.pending++
        break
      default:
        summary.pending++
    }
  }
  return summary
}

// ------------------------------------------------------------------ runner

async function loop(queue: ImportQueue) {
  if (loops.has(queue)) return
  loops.add(queue)
  watchUnload()
  // The account's pages wait for the run instead of re-loading after every file.
  importingAccounts.add(queue.accountId)
  let changed = false
  try {
    while (queue.state === 'running') {
      await readCaptureTimes(queue)
      if (queue.state !== 'running') break
      const run = queue.run
      const item = run && queue.items.find((i) => i.status === 'queued' && run.ids.has(i.id))
      if (!item) break
      const result = await upload(queue, item)
      if (result === 'stored') changed = true
      if (result === 'stop') break
    }
  } finally {
    loops.delete(queue)
    importingAccounts.delete(queue.accountId)
  }

  if (discarded.has(queue)) return
  if (queue.state === 'pausing' || queue.state === 'paused') {
    queue.state = 'paused'
    if (changed) reloadAccount(queue)
    return
  }
  if (changed) reloadAccount(queue)
  if (queue.state === 'cancelling') finishCancelled(queue)
  else finishDone(queue)
}

type UploadResult = 'stored' | 'failed' | 'requeued' | 'stop'

async function upload(queue: ImportQueue, item: ImportItem): Promise<UploadResult> {
  item.status = 'uploading'
  item.message = null
  let rateLimited = 0
  let transient = 0
  for (;;) {
    const paced = await pace(queue, item)
    if (!paced || queue.state !== 'running') return requeue(item)
    try {
      const { body, gzip } = await compressFile(item.file)
      noteRequest(queue.accountId)
      // Quiet: the live pages hear about the run once, when it ends (reloadAccount).
      const result = await api.importGood(queue.accountId, body, { gzip, quiet: true })
      item.status = result.status
      item.takenAt = result.takenAt
      item.sentBytes = body.size
      item.storedSize = result.storedSize
      item.snapshotId = result.snapshotId
      if (queue.run) queue.run.sentBytes += body.size
      return 'stored'
    } catch (error) {
      const status = error instanceof ApiRequestError ? error.status : -1
      if (error instanceof ApiRequestError && QUOTA_CODES.has(error.code)) {
        // Every later file that stores something would be refused too.
        fail(item, describeError(error, item), true)
        queue.state = 'pausing'
        useFeedback().toast({
          tone: 'danger',
          title: 'Upload paused',
          detail: item.message ?? undefined,
        })
        return 'stop'
      }
      if (status === 429 && ++rateLimited <= MAX_RATE_LIMIT_RETRIES) {
        const resumed = await wait(
          queue,
          item,
          Math.min(60_000, 15_000 * rateLimited),
          'Rate limited',
        )
        if (!resumed) return requeue(item)
        continue
      }
      if ((status === 0 || status >= 500) && ++transient <= MAX_TRANSIENT_RETRIES) {
        const resumed = await wait(
          queue,
          item,
          5_000 * 2 ** (transient - 1),
          status === 0 ? 'Offline' : 'Server error',
        )
        if (!resumed) return requeue(item)
        continue
      }
      if (status === 401) {
        // Signed out: keep the file and stop, so nothing else fails for the same reason.
        requeue(item)
        queue.state = 'pausing'
        useFeedback().toast({
          tone: 'danger',
          title: 'Upload paused',
          detail: 'Signed out',
        })
        return 'stop'
      }
      if (status === 404) {
        fail(item, 'Account deleted')
        queue.state = 'cancelling'
        return 'stop'
      }
      fail(item, describeError(error, item), status === 429 || status === 0 || status >= 500)
      return 'failed'
    }
  }
}

function requeue(item: ImportItem): UploadResult {
  item.status = 'queued'
  item.message = null
  return 'requeued'
}

function describeError(error: unknown, item: ImportItem): string {
  if (!(error instanceof ApiRequestError)) {
    return error instanceof Error ? 'Unreadable file' : 'Upload failed'
  }
  switch (error.code) {
    case 'duplicate_capture':
      return item.takenAt
        ? `Other snapshot at ${formatDateTime(item.takenAt)}`
        : 'Other snapshot at this time'
    case 'rate_limited':
      return 'Rate limited'
    case 'daily_upload_limit':
      return `Daily limit · resets ${formatTime(nextUtcMidnight())}`
    case 'storage_quota':
      return 'Storage full'
    default:
      return error.message
  }
}

/** Refusals by the per-user quotas (the server's upload limits), not by the file. */
const QUOTA_CODES = new Set(['daily_upload_limit', 'storage_quota'])

/** When the daily upload quota starts over: the next 00:00 UTC. */
function nextUtcMidnight(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

function noteRequest(accountId: number) {
  const times = recent.get(accountId) ?? []
  times.push(Date.now())
  recent.set(accountId, times)
}

/** Waits until another upload fits in the per-minute budget. */
async function pace(queue: ImportQueue, item: ImportItem): Promise<boolean> {
  const now = Date.now()
  const times = (recent.get(queue.accountId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.set(queue.accountId, times)
  if (times.length < PACED_LIMIT) return true
  const until = times[times.length - PACED_LIMIT]! + RATE_WINDOW_MS + 250
  return wait(queue, item, until - now, 'Rate limit: 60 files a minute')
}

/** Sleeps, showing why; false if paused or cancelled meanwhile. */
async function wait(
  queue: ImportQueue,
  item: ImportItem,
  ms: number,
  reason: string,
): Promise<boolean> {
  item.status = 'waiting'
  item.message = reason
  queue.waitUntil = Date.now() + ms
  queue.waitReason = reason
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      wakers.delete(queue)
      resolve()
    }
    wakers.set(queue, done)
  })
  queue.waitUntil = null
  queue.waitReason = null
  if (queue.state !== 'running') return false
  item.status = 'uploading'
  item.message = null
  return true
}

function wake(queue: ImportQueue) {
  wakers.get(queue)?.()
}

function finishCancelled(queue: ImportQueue) {
  const run = queue.run
  for (const item of queue.items) {
    if (item.status === 'queued' && run?.ids.has(item.id)) item.status = 'cancelled'
  }
  queue.state = 'idle'
  if (!run) return
  run.finishedAt = Date.now()
  run.outcome = 'cancelled'
  const summary = summarize(queue)
  const stored = summary.created + summary.unchanged
  useFeedback().toast({
    tone: 'info',
    title: 'Upload cancelled',
    detail: `${formatNumber(stored)}/${formatNumber(summary.total)} imported`,
  })
}

function finishDone(queue: ImportQueue) {
  queue.state = 'idle'
  const run = queue.run
  if (!run) return
  run.finishedAt = Date.now()
  run.outcome = 'done'
  const s = summarize(queue)
  if (s.total === 0) return

  const title =
    s.created > 0
      ? `${formatNumber(s.created)} new ${s.created === 1 ? 'snapshot' : 'snapshots'}`
      : s.unchanged > 0
        ? 'Nothing new'
        : `${formatNumber(s.failed)} failed`
  const parts: string[] = []
  if (s.unchanged > 0) parts.push(`${formatNumber(s.unchanged)} unchanged`)
  if (s.failed > 0 && (s.created > 0 || s.unchanged > 0))
    parts.push(`${formatNumber(s.failed)} failed`)
  const accountId = queue.accountId
  useFeedback().toast(
    {
      tone: s.failed === 0 ? 'success' : s.failed === s.total ? 'danger' : 'info',
      title,
      detail: parts.join(' · ') || undefined,
      action:
        s.created + s.unchanged > 0
          ? {
              label: 'Snapshots',
              run: () => void router.push({ name: 'account-snapshots', params: { accountId } }),
            }
          : undefined,
    },
    10_000,
  )
}

/** Re-reads the account after a run, and tells the live pages (its uploads were quiet). */
function reloadAccount(queue: ImportQueue) {
  useAccounts()
    .reload(queue.accountId, { announce: true })
    .catch(() => {
      // The list refreshes on the next navigation; nothing to tell the user.
    })
}

let unloadWatched = false

/** Closing the tab drops the queue: ask first while an upload is running. */
function watchUnload() {
  if (unloadWatched) return
  unloadWatched = true
  window.addEventListener('beforeunload', (event) => {
    for (const queue of queues.values()) {
      if (isBusy(queue)) {
        event.preventDefault()
        return
      }
    }
  })
}
