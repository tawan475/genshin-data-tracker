/**
 * Inflates and decodes account bundles off the main thread (see
 * @/data/decode): a bundle of every snapshot's materials or achievements is
 * hundreds of small deflated sections, a long task on a phone.
 *
 * Keep this module free of dynamic imports: production workers are bundled
 * as a single classic script.
 */

// The codec alone: the package's index would bring every API schema along.
import { decodeBundle } from '@gdt/shared/codec/bundle'
import type { DecodeReply, DecodeRequest } from '@/data/decode-protocol'

/** The parts of DedicatedWorkerGlobalScope used here (the app compiles against the DOM lib). */
interface WorkerScope {
  postMessage(message: DecodeReply): void
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null
}
const scope = self as unknown as WorkerScope

scope.onmessage = async ({ data }) => {
  try {
    scope.postMessage({ id: data.id, ok: true, bundle: await decodeBundle(data.buffer) })
  } catch (error) {
    scope.postMessage({ id: data.id, ok: false, error: String((error as Error)?.message ?? error) })
  }
}
