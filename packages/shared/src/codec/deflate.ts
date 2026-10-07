/**
 * Synchronous raw DEFLATE (fflate) for the v2 storage formats. Unlike the
 * platform's CompressionStream, it takes a preset dictionary, which is what
 * lets a small section be compressed against the bytes of its base. The same
 * code runs in the Worker and the browser.
 */

import { deflateSync, inflateSync } from 'fflate'
import { CorruptDataError } from './bytes'

/** Strongest setting: sections are written once and read many times. */
export function deflate(data: Uint8Array, dictionary?: Uint8Array): Uint8Array {
  return deflateSync(data, dictionary ? { level: 9, mem: 12, dictionary } : { level: 9, mem: 12 })
}

export function inflate(data: Uint8Array, dictionary?: Uint8Array): Uint8Array {
  try {
    return inflateSync(data, dictionary ? { dictionary } : {})
  } catch (error) {
    throw new CorruptDataError(`Invalid deflate data: ${(error as Error).message}`)
  }
}
