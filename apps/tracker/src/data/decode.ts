import { decodeBundle, type BundleSnapshot } from '@gdt/shared'
import type { DecodeReply, DecodeRequest } from './decode-protocol'

/**
 * Bundle decoding in a Web Worker (src/workers/decode.worker.ts), so
 * inflating hundreds of sections never freezes the page; the page gets the
 * same plain result back. Small bundles (one snapshot's sections) decode
 * here: the hand-off would cost more than it saves. Without workers, or if
 * the worker fails, everything decodes here as before.
 */

type Decoded = { snapshots: BundleSnapshot[]; texts: Map<string, string> }

/** Below this many bytes a bundle decodes on the main thread. */
const WORKER_MIN_BYTES = 16 * 1024

let worker: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, { resolve: (d: Decoded) => void; reject: (e: Error) => void }>()

function failAll(error: Error) {
  for (const { reject } of waiting.values()) reject(error)
  waiting.clear()
}

function start(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('../workers/decode.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }: MessageEvent<DecodeReply>) => {
      const job = waiting.get(data.id)
      if (!job) return
      waiting.delete(data.id)
      if (data.ok) job.resolve(data.bundle)
      else job.reject(new Error(data.error))
    }
    worker.onerror = () => {
      // The worker could not start (or crashed): decode here from now on.
      worker?.terminate()
      worker = null
      failAll(new Error('decode worker failed'))
    }
  } catch {
    worker = null
  }
  return worker
}

/** Starts the worker ahead of the first bundle (idle time at an account's opening). */
export function warmDecoder(): void {
  start()
}

/** The decoded bundle, off the main thread when it is worth it. */
export async function decodeBundleOffThread(buffer: ArrayBuffer): Promise<Decoded> {
  const target = buffer.byteLength >= WORKER_MIN_BYTES ? start() : null
  if (!target) return decodeBundle(buffer)
  // The worker gets a copy: the caller's bytes stay usable (the IndexedDB
  // store may still be writing them).
  const copy = buffer.slice(0)
  try {
    return await new Promise<Decoded>((resolve, reject) => {
      const id = nextId++
      waiting.set(id, { resolve, reject })
      const message: DecodeRequest = { id, buffer: copy }
      target.postMessage(message, [copy])
    })
  } catch {
    return decodeBundle(buffer)
  }
}
