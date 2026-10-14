/**
 * Reading GOOD files in the browser before upload: collecting them from a drop
 * (folders included), finding each file's capture time cheaply, and gzipping.
 */

import { resolveImportTimestamp } from '@gdt/shared'
import { t } from '@/i18n'
import { captureTimeFromName } from './capture-time-name'

export function isJsonFile(name: string): boolean {
  return /\.json$/i.test(name)
}

export interface CollectedFiles {
  files: File[]
  /** Files skipped because they are not .json. */
  ignored: number
}

/** Splits picked files into GOOD candidates (.json) and the rest. */
export function collectFiles(list: Iterable<File>): CollectedFiles {
  const files: File[] = []
  let ignored = 0
  for (const file of list) {
    if (isJsonFile(file.name)) files.push(file)
    else ignored++
  }
  return { files, ignored }
}

/** Files from a drop, walking into dropped folders (to a sane depth). */
export async function collectDropped(transfer: DataTransfer): Promise<CollectedFiles> {
  // Entries must be taken synchronously: the DataTransfer empties after the event.
  const entries = Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null)
  if (entries.length === 0 || !entries.some((entry) => entry?.isDirectory)) {
    return collectFiles(Array.from(transfer.files))
  }
  const out: CollectedFiles = { files: [], ignored: 0 }
  for (const entry of entries) if (entry) await walk(entry, out, 0)
  return out
}

async function walk(entry: FileSystemEntry, out: CollectedFiles, depth: number): Promise<void> {
  if (entry.isFile) {
    if (!isJsonFile(entry.name)) {
      out.ignored++
      return
    }
    out.files.push(
      await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      ),
    )
    return
  }
  if (!entry.isDirectory || depth > 8) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries returns the listing in batches until an empty one.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    if (batch.length === 0) return
    for (const child of batch) await walk(child, out, depth + 1)
  }
}

export interface CaptureTimeResult {
  /** Epoch ms, or null when the file carries no timestamp (the server then uses upload time). */
  takenAt: number | null
  /**
   * The time came from the file's name, not its contents: the upload must
   * send it (the server only reads a time from the contents by itself).
   */
  fromName?: boolean
  /** Set when the file cannot be a GOOD export at all. */
  invalid?: string
}

const SCALAR = String.raw`(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")`
/** Irminsul writes `timestamp` as the last key of the file. */
const TAIL_TIMESTAMP = new RegExp(String.raw`"timestamp"\s*:\s*${SCALAR}\s*}\s*$`)
const HEAD_TIMESTAMP = new RegExp(String.raw`"timestamp"\s*:\s*${SCALAR}`)

function toMs(token: string | undefined): number | null {
  if (token === undefined) return null
  let value: unknown
  try {
    value = JSON.parse(token)
  } catch {
    return null
  }
  // Same coercion the Worker applies, so the time shown is the time stored.
  const ms = resolveImportTimestamp(undefined, value, Number.NaN)
  return Number.isNaN(ms) ? null : ms
}

/**
 * The capture time a GOOD file carries. Reads its last and first bytes first
 * (where exporters put `timestamp`); only when neither has it is the whole
 * file parsed, which also catches files that are not JSON before uploading.
 * A file without one falls back to the date and time in its name.
 */
export async function readCaptureTime(file: File): Promise<CaptureTimeResult> {
  const tail = await file.slice(Math.max(0, file.size - 512)).text()
  const fromTail = toMs(TAIL_TIMESTAMP.exec(tail)?.[1])
  if (fromTail !== null) return { takenAt: fromTail }

  // Top-level scalars come before the first array or nested object; a bracket
  // inside a string only shortens the region, which falls through to the parse.
  const head = await file.slice(0, 2048).text()
  const root = head.indexOf('{')
  let end = head.length
  for (const index of [head.indexOf('[', root + 1), head.indexOf('{', root + 1)]) {
    if (index !== -1 && index < end) end = index
  }
  const fromHead = root === -1 ? null : toMs(HEAD_TIMESTAMP.exec(head.slice(root, end))?.[1])
  if (fromHead !== null) return { takenAt: fromHead }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return { takenAt: null, invalid: t('transfer.upload.notJson') }
  }
  // GOOD requires `format: "GOOD"`; the server is laxer, so catch strays here.
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (parsed as { format?: unknown }).format !== 'GOOD'
  ) {
    return { takenAt: null, invalid: t('transfer.upload.notGood') }
  }
  const raw = (parsed as { timestamp?: unknown }).timestamp
  const ms = raw === undefined ? Number.NaN : resolveImportTimestamp(undefined, raw, Number.NaN)
  if (!Number.isNaN(ms)) return { takenAt: ms }
  const fromName = captureTimeFromName(file.name)
  return fromName === null ? { takenAt: null } : { takenAt: fromName, fromName: true }
}

/** Gzips a file for upload (about 13x smaller for GOOD JSON). */
export async function compressFile(file: Blob): Promise<{ body: Blob; gzip: boolean }> {
  if (typeof CompressionStream === 'undefined') return { body: file, gzip: false }
  const stream = file.stream().pipeThrough(new CompressionStream('gzip'))
  return { body: await new Response(stream).blob(), gzip: true }
}
