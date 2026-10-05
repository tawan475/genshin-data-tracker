/**
 * Builds a zip of GOOD files off the main thread (see @/data/export-protocol).
 * One snapshot decodes to ~1 MB of JSON, so a full account is well over
 * 100 MB of text: it is produced, deflated and posted one file at a time.
 *
 * Keep this module free of dynamic imports: production workers are bundled
 * as a single classic script.
 */

import {
  catalogFromRows,
  inflateBundle,
  readBundle,
  sectionHashesOf,
  type CatalogRow,
} from '@gdt/shared'
import { MATERIALS } from '@gdt/shared/dictionary/materials'
import { request } from '@/api/http'
import type { ExportCommand, ExportEvent, ExportStart } from '@/data/export-protocol'
import { decodeFromSections, writeGoodZip } from '@/data/export-zip'

/** The parts of DedicatedWorkerGlobalScope used here (the app compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: ExportEvent, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<ExportCommand>) => void) | null
}
const scope = self as unknown as WorkerScope

function post(message: ExportEvent, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer)
}

/**
 * Past this many ids the query string gets long; the full bundle is small
 * (sections are shared between snapshots), so fetch it all and filter.
 */
const MAX_IDS_IN_URL = 300

function knownLength(response: Response): number | null {
  // A compressed body streams more bytes than Content-Length says.
  if (response.headers.get('content-encoding')) return null
  const length = Number(response.headers.get('content-length'))
  return Number.isFinite(length) && length > 0 ? length : null
}

async function readBody(response: Response, onBytes: (count: number) => void) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onBytes(bytes.length)
    return bytes
  }
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    length += value.length
    onBytes(value.length)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

async function run({ accountId, ids, level }: ExportStart) {
  const query = ids && ids.length <= MAX_IDS_IN_URL ? `?ids=${ids.join(',')}` : ''
  const [bundleResponse, catalogResponse] = await Promise.all([
    request(`/api/accounts/${accountId}/bundle${query}`),
    request(`/api/accounts/${accountId}/catalog`),
  ])
  const lengths = [knownLength(bundleResponse), knownLength(catalogResponse)]
  const total = lengths.every((n) => n !== null)
    ? lengths.reduce<number>((sum, n) => sum + n!, 0)
    : null
  let loaded = 0
  const onBytes = (count: number) => {
    loaded += count
    post({ type: 'fetching', loaded, total })
  }
  const [bundleBytes, catalogBytes] = await Promise.all([
    readBody(bundleResponse, onBytes),
    readBody(catalogResponse, onBytes),
  ])

  const { manifest, blobs } = readBundle(bundleBytes)
  const wanted = ids ? new Set(ids) : null
  const snapshots = wanted
    ? manifest.snapshots.filter((snapshot) => wanted.has(snapshot.id))
    : manifest.snapshots
  if (snapshots.length === 0) {
    throw new Error('Snapshots no longer exist')
  }
  // Every section the selection decodes: bases and irminsul's extras included.
  const needed = new Set(snapshots.flatMap(sectionHashesOf))
  const texts = await inflateBundle(new Map([...blobs].filter(([hash]) => needed.has(hash))))
  const rows = JSON.parse(new TextDecoder().decode(catalogBytes)) as CatalogRow[]
  const catalog = catalogFromRows(rows)

  const totals = writeGoodZip({
    snapshots,
    decode: (snapshot) => decodeFromSections(snapshot, texts, catalog, MATERIALS),
    // fflate may hand out views of buffers it still uses: copy, then transfer the copy.
    onChunk: (chunk) => {
      const data = chunk.slice()
      post({ type: 'chunk', data }, [data.buffer])
    },
    onProgress: (progress) => post({ type: 'progress', ...progress }),
    level,
  })
  post({
    type: 'done',
    files: totals.done,
    jsonBytes: totals.jsonBytes,
    zipBytes: totals.zipBytes,
  })
}

scope.onmessage = (event) => {
  const command = event.data
  if (command.type !== 'start') return
  run(command).catch((error: unknown) => {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : 'The export failed.',
    })
  })
}
