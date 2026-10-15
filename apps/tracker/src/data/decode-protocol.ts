import type { BundleSnapshot } from '@gdt/shared'

/** A bundle to decode (its bytes are moved to the worker). */
export interface DecodeRequest {
  id: number
  buffer: ArrayBuffer
}

export type DecodeReply =
  | { id: number; ok: true; bundle: { snapshots: BundleSnapshot[]; texts: Map<string, string> } }
  | { id: number; ok: false; error: string }
